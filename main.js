/**
 * AURA OS — Electron main process.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { logger } = require('./src/logger');
logger.init(path.join(app.getPath('userData'), 'logs'));

const taskStore = require('./src/taskstore');
taskStore.init(path.join(app.getPath('userData'), 'logs'));

const { AgentManager } = require('./src/agents');
const { Memory } = require('./src/memory');
const { Orchestrator } = require('./src/orchestrator');
const { TelegramTerminal } = require('./src/telegram');
const updater = require('./src/updater');

// ---------- tiny JSON settings store ----------
class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'aura-settings.json');
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (_) { this.data = {}; }
  }
  get(key, def) { return key in this.data ? this.data[key] : def; }
  set(key, value) {
    this.data[key] = value;
    try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); } catch (_) {}
  }
}

let win = null;
const store = new Store();
const agents = new AgentManager(store);
const memory = new Memory(store);
// Аудит базы знаний — дополнить типовой структурой, если не хватает
const audit = memory.auditTemplate();
if (audit.updated) {
  console.log('[AURA] База знаний дополнена типовой структурой: ' + audit.files_added.join(', '));
}

// Fan out orchestrator events to both the UI and the Telegram terminal.
// Заодно персистим историю задач и их логи на диск (переживают перезапуск/краш).
function dispatchEvent(event) {
  taskStore.record(event);
  if (win && !win.isDestroyed()) win.webContents.send('aura-event', event);
  if (telegram) telegram.onAuraEvent(event);
}
const orchestrator = new Orchestrator(agents, memory, store, dispatchEvent);

const telegram = new TelegramTerminal({
  store, orchestrator, agents,
  onStatus: (s) => { if (win && !win.isDestroyed()) win.webContents.send('telegram-status', s); },
  onLog: (line) => process.stdout.write(line)
});

// ---------- Auto-install Node.js и Python если их нет ----------
const RUNTIME_DIR = path.join(require('os').homedir(), '.aura-runtime');

async function ensureRuntime() {
  const { spawnSync } = require('child_process');
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const http = require('https');
  const fs = require('fs');

  function check(cmd) {
    try {
      const r = spawnSync(isWin ? 'cmd.exe' : 'sh', [isWin ? '/c' : '-c', cmd + ' --version 2>&1'], { windowsHide: true, encoding: 'utf8' });
      return r.status === 0;
    } catch (_) { return false; }
  }

  function run(cmd) {
    return spawnSync(isWin ? 'cmd.exe' : 'sh', [isWin ? '/c' : '-c', cmd], { windowsHide: true, encoding: 'utf8', timeout: 120000 });
  }

  function download(url, dest) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      http.get(url, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    });
  }

  // Fallback portable установка (без прав администратора)
  async function installPortable(platform, version) {
    console.log(`[AURA] Пробую portable ${platform}...`);
    const tmp = path.join(RUNTIME_DIR, 'tmp');
    if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
    const targetDir = path.join(RUNTIME_DIR, platform);

    if (platform === 'node') {
      const isArm = isMac && require('os').arch() === 'arm64';
      const arch = isWin ? 'win-x64' : (isArm ? 'darwin-arm64' : (isMac ? 'darwin-x64' : 'linux-x64'));
      const archive = `node-v${version}-${arch}.tar.gz`;
      const dest = path.join(tmp, archive);
      await download(`https://nodejs.org/dist/v${version}/${archive}`, dest);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      run(`tar -xzf "${dest}" -C "${targetDir}" --strip-components=1`);
      fs.unlinkSync(dest);
      process.env.PATH = path.join(targetDir, 'bin') + path.delimiter + process.env.PATH;
    } else {
      // Python portable
      if (isWin) {
        const archive = `python-${version}-embed-amd64.zip`;
        const dest = path.join(tmp, archive);
        await download(`https://www.python.org/ftp/python/${version}/${archive}`, dest);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        run(`powershell -c "Expand-Archive -Path '${dest}' -DestinationPath '${targetDir}' -Force"`);
        fs.unlinkSync(dest);
        process.env.PATH = targetDir + path.delimiter + process.env.PATH;
      } else {
        // На Linux/macOS portable python через tar.gz (python-build-standalone)
        const isArm = isMac && require('os').arch() === 'arm64';
        const arch = isArm ? 'aarch64' : 'x86_64';
        const tag = `20250317`; // последний релиз python-build-standalone
        const archive = `cpython-${version}+${tag}-${arch}-unknown-linux-gnu-install_only.tar.gz`;
        const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/${archive}`;
        const dest = path.join(tmp, archive);
        await download(url, dest);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        run(`tar -xzf "${dest}" -C "${targetDir}" --strip-components=1`);
        fs.unlinkSync(dest);
        process.env.PATH = path.join(targetDir, 'bin') + path.delimiter + process.env.PATH;
      }
    }
    return check(platform === 'node' ? 'node' : 'python') || check(platform === 'node' ? 'node' : 'python3');
  }

  async function tryInstall(label, installerFn) {
    console.log(`[AURA] ${label} не найден — устанавливаю...`);
    const ok = await installerFn();
    if (ok) return ok;
    // Если не сработало — portable fallback
    console.log(`[AURA] Установка ${label} не удалась. Пробую portable версию...`);
    const platform = label.toLowerCase();
    const version = platform === 'node' ? '26.1.0' : '3.12.3';
    return await installPortable(platform, version);
  }

  // ─── Node.js ────────────────────────────────────────────
  let nodeOk = check('node');
  if (!nodeOk) {
    const nodeDir = path.join(RUNTIME_DIR, 'node');
    if (fs.existsSync(path.join(nodeDir, 'node' + (isWin ? '.exe' : '')))) {
      process.env.PATH = path.join(nodeDir, 'bin') + path.delimiter + process.env.PATH;
      nodeOk = check('node');
    }
  }
  if (!nodeOk) {
    nodeOk = await tryInstall('Node', async () => {
      const tmp = path.join(RUNTIME_DIR, 'tmp');
      if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
      if (isWin) {
        const installer = path.join(tmp, 'node-v26.1.0-x64.msi');
        await download('https://nodejs.org/dist/v26.1.0/node-v26.1.0-x64.msi', installer);
        run(`msiexec /i "${installer}" /quiet /norestart`);
        await new Promise(r => setTimeout(r, 30000));
        fs.unlinkSync(installer);
      } else if (isMac) {
        const arch = require('os').arch() === 'arm64' ? 'arm64' : 'x64';
        const pkg = `node-v26.1.0-${arch}.pkg`;
        const dest = path.join(tmp, pkg);
        await download(`https://nodejs.org/dist/v26.1.0/${pkg}`, dest);
        run(`sudo installer -pkg "${dest}" -target /`);
        await new Promise(r => setTimeout(r, 20000));
        fs.unlinkSync(dest);
      } else {
        run('curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -');
        run('sudo apt-get install -y nodejs 2>&1');
        await new Promise(r => setTimeout(r, 20000));
      }
      return check('node');
    });
    console.log(`[AURA] Node.js: ${nodeOk ? '✓' : '✗'}`);
  } else {
    console.log('[AURA] Node.js ✓');
  }

  // ─── Python ────────────────────────────────────────────
  let pythonOk = check('python') || check('python3');
  if (!pythonOk) {
    const pyDir = path.join(RUNTIME_DIR, 'python');
    if (fs.existsSync(path.join(pyDir, 'python' + (isWin ? '.exe' : ''))) || fs.existsSync(path.join(pyDir, 'python3'))) {
      process.env.PATH = path.join(pyDir, 'bin') + path.delimiter + process.env.PATH;
      pythonOk = check('python') || check('python3');
    }
  }
  if (!pythonOk) {
    pythonOk = await tryInstall('Python', async () => {
      const tmp = path.join(RUNTIME_DIR, 'tmp');
      if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
      if (isWin) {
        const installer = path.join(tmp, 'python-3.12.3-amd64.exe');
        await download('https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe', installer);
        run(`"${installer}" /quiet InstallAllUsers=0 PrependPath=1`);
        await new Promise(r => setTimeout(r, 20000));
        fs.unlinkSync(installer);
      } else if (isMac) {
        const pkg = 'python-3.12.3-macos11.pkg';
        const dest = path.join(tmp, pkg);
        await download(`https://www.python.org/ftp/python/3.12.3/${pkg}`, dest);
        run(`sudo installer -pkg "${dest}" -target /`);
        await new Promise(r => setTimeout(r, 20000));
        fs.unlinkSync(dest);
      } else {
        run('sudo add-apt-repository -y ppa:deadsnakes/ppa 2>&1');
        run('sudo apt-get update -qq 2>&1');
        run('sudo apt-get install -y python3.12 python3.12-pip python3.12-venv 2>&1');
        run('sudo ln -sf /usr/bin/python3.12 /usr/local/bin/python 2>&1');
        run('sudo ln -sf /usr/bin/pip3.12 /usr/local/bin/pip 2>&1');
        await new Promise(r => setTimeout(r, 15000));
      }
      return check('python') || check('python3');
    });
    console.log(`[AURA] Python: ${pythonOk ? '✓' : '✗'}`);
  } else {
    console.log('[AURA] Python ✓');
  }

  return { node: nodeOk, python: pythonOk };
}

// ---------- Hermes Agent — ОПЦИОНАЛЬНЫЙ движок ----------
// Раньше Hermes был обязательным и ставился авто-`npm install -g` при старте.
// Это требовало подписки/ключа и ломало обещание «просто работает» (отзыв 1.0.3).
// Теперь: если Hermes есть — используем; если нет — не трогаем и не ставим.
// Установка — только осознанно, через UI.
function ensureHermes() {
  return new Promise(resolve => {
    const { spawn } = require('child_process');
    const isWin = process.platform === 'win32';
    const test = spawn(isWin ? 'cmd.exe' : 'sh', [isWin ? '/c' : '-c', 'hermes --version 2>&1'], { windowsHide: true });
    let verOut = '';
    test.stdout.on('data', d => verOut += d.toString());
    test.stderr.on('data', d => verOut += d.toString());
    test.on('error', () => resolve(false));
    test.on('close', (code) => {
      if (code === 0) {
        const ver = verOut.match(/\d+\.\d+\.\d+/);
        console.log('[AURA] Hermes Agent найден: v' + (ver ? ver[0] : '?') + ' (опциональный движок)');
        resolve(true);
      } else {
        console.log('[AURA] Hermes Agent не установлен — это нормально, движок опциональный.');
        resolve(false);
      }
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b0f17',
    show: false,
    autoHideMenuBar: true,
    title: 'AURA OS',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Показываем окно как только отрисовался первый кадр — никакого «висит
  // в диспетчере, на экране пусто». Среда (Node/Python/Hermes/движки)
  // догружается в фоне за сплэшем, см. runSetup().
  win.once('ready-to-show', () => { win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('maximize', () => win.webContents.send('window:maximized'));
  win.on('unmaximize', () => win.webContents.send('window:unmaximized'));
}

// ---------- Прогресс начальной настройки (для сплэша) ----------
const setupState = { done: false, pct: 0, step: 'boot', text: 'Запуск…', steps: [] };
function emitSetup(step, text, pct) {
  setupState.step = step;
  setupState.text = text;
  if (typeof pct === 'number') setupState.pct = pct;
  setupState.steps.push({ step, text, t: Date.now() });
  console.log(`[AURA][setup] ${pct != null ? pct + '% ' : ''}${text}`);
  if (win && !win.isDestroyed()) win.webContents.send('setup:progress', { ...setupState });
}

async function runSetup() {
  try {
    emitSetup('runtime', 'Проверяю окружение (Node.js / Python)…', 10);
    await ensureRuntime();
    emitSetup('hermes', 'Проверяю движки…', 55);
    await ensureHermes();
    emitSetup('engines', 'Определяю доступные движки и агентов…', 80);
    await orchestrator.detectEngines();
    telegram.restart().catch(() => {});
    emitSetup('ready', 'Готово', 100);
  } catch (e) {
    console.error('[AURA] runSetup error:', e);
    emitSetup('ready', 'Готово (с предупреждениями)', 100);
  } finally {
    setupState.done = true;
    if (win && !win.isDestroyed()) win.webContents.send('setup:done', { ...setupState });
  }
}

app.whenReady().then(() => {
  // Окно — СРАЗУ. Тяжёлая настройка идёт за сплэшем в фоне.
  createWindow();
  runSetup();
  updater.init(win); // авто-обновление (no-op в dev/portable)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => {
  agents.cancelAll();
  telegram.stop();
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC ----------
ipcMain.handle('agents:list', async () => {
  const list = agents.getAgents();
  const availability = await agents.detectAll();
  const enabled = store.get('enabledAgents', {});
  return list.map(a => ({
    ...a,
    available: !!(availability[a.id] && availability[a.id].available),
    path: availability[a.id] ? availability[a.id].path : undefined,
    enabled: enabled[a.id] !== false
  }));
});
ipcMain.handle('agents:add', (_e, def) => agents.addCustomAgent(def));
ipcMain.handle('agents:remove', (_e, id) => agents.removeCustomAgent(id));
ipcMain.handle('agents:update', (_e, { id, patch }) => agents.updateAgent(id, patch));
ipcMain.handle('agents:toggle', (_e, { id, enabled }) => {
  const map = store.get('enabledAgents', {});
  map[id] = enabled;
  store.set('enabledAgents', map);
});

ipcMain.handle('agents:install', async (_e, { command }) => {
  return new Promise(resolve => {
    const cmd = `npm install -g ${command}`;
    console.log('[AURA] agents:install ' + command);
    const child = require('child_process').spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh',
      [process.platform === 'win32' ? '/c' : '-c', cmd],
      { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', (code) => { console.log('[AURA] agents:install ' + command + ' → code ' + code); resolve({ ok: code === 0, output: out.trim(), code }); });
  });
});

ipcMain.handle('agents:uninstall', async (_e, { command }) => {
  return new Promise(resolve => {
    const cmd = `npm uninstall -g ${command}`;
    console.log('[AURA] agents:uninstall ' + command);
    const child = require('child_process').spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh',
      [process.platform === 'win32' ? '/c' : '-c', cmd],
      { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', (code) => { console.log('[AURA] agents:uninstall ' + command + ' → code ' + code); resolve({ ok: code === 0, output: out.trim(), code }); });
  });
});

ipcMain.handle('task:start', (_e, input) => orchestrator.startTask(input));
ipcMain.handle('task:cancel', (_e, id) => orchestrator.cancelTask(id));
ipcMain.handle('task:list', () => taskStore.mergeHistory(orchestrator.listTasks()));
ipcMain.handle('task:logs', (_e, ids) => taskStore.logsFor(ids));
ipcMain.handle('task:clearHistory', () => { taskStore.clear(); return { ok: true }; });
ipcMain.handle('clarify:answer', (_e, { taskId, answers }) => orchestrator.resolveClarify(taskId, answers));

// ---------- Dynamic Harness ----------
ipcMain.handle('harness:plan', (_e, input) => orchestrator.planHarness(input));
ipcMain.handle('harness:start', (_e, { input, opts }) => orchestrator.startHarness(input, opts || {}));

// ---------- Авто-обновление ----------
ipcMain.handle('update:get', () => updater.state());
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', () => updater.install());

// ---------- Ralph Loop ----------
ipcMain.handle('loop:start', (_e, { input, opts }) => orchestrator.startLoop(input, opts || {}));
ipcMain.handle('loop:stop', (_e, id) => orchestrator.stopLoop(id));
ipcMain.handle('loop:confirm', (_e, { id, go }) => orchestrator.confirmLoop(id, go));
ipcMain.handle('loop:estimate', (_e, { input, opts }) => orchestrator.estimateLoopCost(input, opts || {}));

// ---------- CONSTRAINTS.md (Self-Improving Loop) ----------
ipcMain.handle('constraints:list', () => memory.listConstraints());
ipcMain.handle('constraints:add', (_e, rule) => memory.appendConstraint(rule, 'manual'));
ipcMain.handle('constraints:open', () => {
  const p = memory.constraintsPath();
  if (!fs.existsSync(p)) memory.appendConstraint('пример правила — удалите его', 'init');
  shell.openPath(p);
});

// ---------- Pro status ----------
ipcMain.handle('pro:status', () => orchestrator.proStatus());

ipcMain.handle('settings:get', () => ({
  version: require('./package.json').version,
  vaultPath: store.get('vaultPath', ''),
  workspace: store.get('workspace', ''),
  maxParallel: store.get('maxParallel', 3),
  maxFixRounds: store.get('maxFixRounds', 2),
  reviewEnabled: store.get('reviewEnabled', true),
  lang: store.get('lang', 'ru'),
  telegramEnabled: store.get('telegramEnabled', false),
  telegramToken: store.get('telegramToken', ''),
  telegramAllowed: store.get('telegramAllowed', ''),
  // Движок: auto / hermes / opencode / claude / legacy
  orchestratorMode: store.get('orchestratorMode', 'auto'),
  hermesAvailable: store.get('_hermesAvailable', false),
  opencodeAvailable: store.get('_opencodeAvailable', false),
  claudeAvailable: store.get('_claudeAvailable', false),
  hermesProfile: store.get('hermesProfile', ''),
  knowledgePath: store.get('knowledgePath', ''),
  openrouterKey: store.get('openrouterKey', ''),
  soulPath: store.get('soulPath', ''),
  // Потолок модели Claude: haiku/sonnet/opus. По умолчанию sonnet — бережёт
  // 5-часовой лимит подписки. Opus только если поднять вручную.
  claudeModelCap: store.get('claudeModelCap', 'sonnet')
}));
ipcMain.handle('settings:set', (_e, patch) => {
  const tgKeys = ['telegramEnabled', 'telegramToken', 'telegramAllowed'];
  const tgChanged = tgKeys.some(k => k in patch);
  for (const [k, v] of Object.entries(patch)) store.set(k, v);
  if (tgChanged) telegram.restart().catch(() => {});
});
ipcMain.handle('telegram:restart', () => telegram.restart());
ipcMain.handle('settings:pickFolder', async (_e, title) => {
  const res = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('settings:pickFile', async (_e, title) => {
  const res = await dialog.showOpenDialog(win, {
    title, properties: ['openFile'],
    filters: [{ name: 'Markdown/Text', extensions: ['md', 'txt', 'markdown'] }, { name: 'All', extensions: ['*'] }]
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('memory:list', () => memory.listNotes());
ipcMain.handle('memory:read', (_e, p) => memory.readNote(p));
ipcMain.handle('memory:openVault', () => {
  if (memory.isConfigured()) shell.openPath(memory.vaultPath());
});
ipcMain.handle('memory:getGraphHTML', () => {
  return memory.getGraphHTML();
});
ipcMain.handle('memory:getGraph', () => {
  return memory.getGraphData();
});
ipcMain.handle('memory:auditTemplate', () => {
  return memory.auditTemplate();
});
ipcMain.handle('memory:tree', async (_e, dir) => {
  const base = dir || memory.basePath();
  function walk(d) { 
    const entries = [];
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) entries.push({ name: e.name, path: full, type: 'dir', children: walk(full) });
        else if (e.name.endsWith('.md')) entries.push({ name: e.name, path: full, type: 'file' });
      }
    } catch (_) {}
    return entries;
  }
  return walk(base);
});
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

// ---------- Сплэш / прогресс старта ----------
ipcMain.handle('setup:status', () => ({ ...setupState }));

// ---------- Логи приложения ----------
ipcMain.handle('logs:open', () => { const f = logger.file(); if (f) shell.openPath(f); return f; });
ipcMain.handle('logs:openDir', () => { const d = logger.dir(); if (d) shell.openPath(d); return d; });
ipcMain.handle('logs:tail', (_e, n) => logger.tail(n || 500));

// ---------- Hermes engine: skills, cron, mcp ----------
ipcMain.handle('hermes:status', async () => {
  const isWin = process.platform === 'win32';
  return new Promise(resolve => {
    const child = require('child_process').spawn(isWin ? 'cmd.exe' : 'sh',
      [isWin ? '/c' : '-c', 'hermes --version 2>&1'], { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => out += d.toString());
    child.on('close', (code) => resolve({ ok: code === 0, version: out.trim() }));
  });
});

ipcMain.handle('hermes:exec', (_e, { cmd, args: cmdArgs }) => {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const fullArgs = [...hProf(), cmd, ...(cmdArgs || [])];
    const child = isWin
      ? require('child_process').spawn('cmd.exe', ['/c', 'hermes', ...fullArgs], { windowsHide: true })
      : require('child_process').spawn('hermes', fullArgs, { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, output: out.trim(), code }));
  });
});

// ---------- Skills shop ----------
ipcMain.handle('skills:search', async (_e, { query, source }) => {
  const args = [...hProf(), 'skills', 'search', query];
  if (source && source !== 'all') args.push('--source', source);
  return _hermesExec(args);
});

ipcMain.handle('skills:inspect', async (_e, id) => {
  return _hermesExec([...hProf(), 'skills', 'inspect', id]);
});

ipcMain.handle('skills:install', async (_e, id) => {
  return _hermesExec([...hProf(), 'skills', 'install', id]);
});

/** Аргументы профиля Hermes (пусто = дефолтный профиль). См. orchestrator._profileArgs. */
function hProf() { const p = store.get('hermesProfile', ''); return p ? ['-p', p] : []; }

/** Helper: run a hermes command and return { ok, output, code }. */
function _hermesExec(args) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = isWin
      ? require('child_process').spawn('cmd.exe', ['/c', 'hermes', ...args], { windowsHide: true })
      : require('child_process').spawn('hermes', args, { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, output: out.trim(), code }));
  });
}

/** Экспорт сессий Hermes в Obsidian vault. */
ipcMain.handle('hermes:syncToObsidian', async () => {
  const vault = store.get('vaultPath', '');
  if (!vault) return { ok: false, error: 'Obsidian vault not configured' };

  const listRes = await new Promise(resolve => {
    const isWin = process.platform === 'win32';
    const child = isWin
      ? require('child_process').spawn('cmd.exe', ['/c', 'hermes', ...hProf(), 'sessions', 'list', '--limit', '10'], { windowsHide: true })
      : require('child_process').spawn('hermes', [...hProf(), 'sessions', 'list', '--limit', '10'], { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, output: out.trim() }));
  });
  if (!listRes.ok) return { ok: false, error: listRes.output };

  const auraDir = path.join(vault, 'AURA', 'Hermes');
  if (!fs.existsSync(auraDir)) fs.mkdirSync(auraDir, { recursive: true });
  const count = await _exportHermesSessionsToDir(auraDir, listRes.output);
  return { ok: true, count, path: auraDir };
});

async function _exportHermesSessionsToDir(dir, listOutput) {
  const lines = listOutput.split('\n');
  let exported = 0;
  for (const line of lines) {
    const match = line.match(/^(\d{8}_\d{6}_[a-z0-9]+)\s/);
    if (!match) continue;
    const sessionId = match[1];
    try {
      const res = await new Promise(resolve => {
        const isWin = process.platform === 'win32';
        const child = isWin
          ? require('child_process').spawn('cmd.exe', ['/c', 'hermes', ...hProf(), 'sessions', 'export', sessionId, '--format', 'json'], { windowsHide: true })
          : require('child_process').spawn('hermes', [...hProf(), 'sessions', 'export', sessionId, '--format', 'json'], { windowsHide: true });
        let out = '';
        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', d => { out += d.toString(); });
        child.on('close', (code) => resolve({ ok: code === 0, output: out.trim() }));
      });
      if (res.ok && res.output) {
        const md = `---\nsource: hermes\nsession: ${sessionId}\nexported: ${new Date().toISOString()}\n---\n\n\`\`\`json\n${res.output.slice(0, 10000)}\n\`\`\`\n`;
        const file = path.join(dir, `${sessionId}.md`);
        fs.writeFileSync(file, md, 'utf8');
        exported++;
      }
    } catch (_) { /* skip failed exports */ }
  }
  return exported;
}

// ---------- Window controls ----------
ipcMain.handle('window:minimize', () => { if (win && !win.isDestroyed()) win.minimize(); });
ipcMain.handle('window:maximize', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  }
});
ipcMain.handle('window:close', () => { if (win && !win.isDestroyed()) win.close(); });
ipcMain.handle('window:isMaximized', () => win && !win.isDestroyed() && win.isMaximized());
