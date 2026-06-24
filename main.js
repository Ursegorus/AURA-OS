/**
 * AURA OS — Electron main process.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { AgentManager } = require('./src/agents');
const { Memory } = require('./src/memory');
const { Orchestrator } = require('./src/orchestrator');
const { TelegramTerminal } = require('./src/telegram');

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

// Fan out orchestrator events to both the UI and the Telegram terminal.
function dispatchEvent(event) {
  if (win && !win.isDestroyed()) win.webContents.send('aura-event', event);
  if (telegram) telegram.onAuraEvent(event);
}
const orchestrator = new Orchestrator(agents, memory, store, dispatchEvent);

const telegram = new TelegramTerminal({
  store, orchestrator, agents,
  onStatus: (s) => { if (win && !win.isDestroyed()) win.webContents.send('telegram-status', s); },
  onLog: (line) => process.stdout.write(line)
});

// ---------- Auto-install / update Hermes Agent (движок обязателен) ----------
function ensureHermes() {
  return new Promise(resolve => {
    const { spawn } = require('child_process');
    const isWin = process.platform === 'win32';

    // Проверяем, установлен ли Hermes
    const test = spawn(isWin ? 'cmd.exe' : 'sh', [isWin ? '/c' : '-c', 'hermes --version 2>&1'], { windowsHide: true });
    let verOut = '';
    test.stdout.on('data', d => verOut += d.toString());
    test.stderr.on('data', d => verOut += d.toString());
    test.on('close', (code) => {
      if (code === 0) {
        const ver = verOut.match(/\d+\.\d+\.\d+/);
        console.log('[AURA] Hermes Agent найден: v' + (ver ? ver[0] : '?'));
        // Проверяем обновление (hermes update)
        const upd = spawn(isWin ? 'cmd.exe' : 'sh', [isWin ? '/c' : '-c', 'hermes update 2>&1'], { windowsHide: true });
        let updOut = '';
        upd.stdout.on('data', d => updOut += d.toString());
        upd.stderr.on('data', d => updOut += d.toString());
        upd.on('close', () => {
          if (updOut.includes('updated') || updOut.includes('Updated')) console.log('[AURA] Hermes обновлён');
          resolve(true);
        });
      } else {
        console.log('[AURA] Hermes Agent не найден — устанавливаю...');
        const install = spawn(isWin ? 'cmd.exe' : 'sh',
          [isWin ? '/c' : '-c', 'npm install -g hermes-agent 2>&1'],
          { windowsHide: true });
        let installOut = '';
        install.stdout.on('data', d => installOut += d.toString());
        install.stderr.on('data', d => installOut += d.toString());
        install.on('close', (code2) => {
          if (code2 === 0) {
            console.log('[AURA] Hermes Agent установлен');
            resolve(true);
          } else {
            console.log('[AURA] Не удалось установить Hermes. Установите вручную: npm install -g hermes-agent');
            console.log(installOut);
            resolve(false);
          }
        });
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('maximize', () => win.webContents.send('window:maximized'));
  win.on('unmaximize', () => win.webContents.send('window:unmaximized'));
}

app.whenReady().then(async () => {
  await ensureHermes();
  await orchestrator.detectEngines();
  createWindow();
  telegram.restart().catch(() => {});
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
    // Пробуем npm install -g, если не сработает — pip install
    const cmd = `npm install -g ${command}`;
    const child = require('child_process').spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh', 
      [process.platform === 'win32' ? '/c' : '-c', cmd],
      { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, output: out.trim(), code }));
  });
});

ipcMain.handle('task:start', (_e, input) => orchestrator.startTask(input));
ipcMain.handle('task:cancel', (_e, id) => orchestrator.cancelTask(id));
ipcMain.handle('task:list', () => orchestrator.listTasks());

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
  // Движок: auto / hermes / opencode / legacy
  orchestratorMode: store.get('orchestratorMode', 'auto'),
  hermesAvailable: store.get('_hermesAvailable', false),
  opencodeAvailable: store.get('_opencodeAvailable', false),
  // AI Free
  useAIFree: store.get('useAIFree', false),
  aifreePath: store.get('aifreePath', '')
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

ipcMain.handle('memory:list', () => memory.listNotes());
ipcMain.handle('memory:read', (_e, p) => memory.readNote(p));
ipcMain.handle('memory:openVault', () => {
  if (memory.isConfigured()) shell.openPath(memory.vaultPath());
});
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

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
    const fullArgs = ['-p', 'aura-os', cmd, ...(cmdArgs || [])];
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
  const args = ['-p', 'aura-os', 'skills', 'search', query];
  if (source && source !== 'all') args.push('--source', source);
  return _hermesExec(args);
});

ipcMain.handle('skills:inspect', async (_e, id) => {
  return _hermesExec(['-p', 'aura-os', 'skills', 'inspect', id]);
});

ipcMain.handle('skills:install', async (_e, id) => {
  return _hermesExec(['-p', 'aura-os', 'skills', 'install', id]);
});

// ---------- AI Free ----------
/** Включить/выключить AI Free провайдер. */
ipcMain.handle('aifree:toggle', async (_e, { enabled }) => {
  store.set('useAIFree', enabled);
  if (enabled) {
    // Устанавливаем AI Free как провайдера для Hermes
    await _hermesExec(['config', 'set', 'model.base_url', 'http://localhost:4318/v1']);
    // AI Free использует DeepSeek — подставляем заглушку ключа (не нужен для localhost)
    await _hermesExec(['config', 'set', 'model.api_key', 'sk-aifree-local']);
    await _hermesExec(['config', 'set', 'model.default', 'deepseek-chat']);
  } else {
    // Сбрасываем
    await _hermesExec(['config', 'set', 'model.base_url', '']);
    await _hermesExec(['config', 'set', 'model.api_key', '']);
    await _hermesExec(['config', 'set', 'model.default', '']);
  }
  return { ok: true };
});

/** Проверить, отвечает ли AI Free API. */
ipcMain.handle('aifree:ping', async () => {
  const http = require('http');
  return new Promise(resolve => {
    const req = http.get('http://localhost:4318/v1/models', (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ ok: res.statusCode === 200, output: body.slice(0, 200) }));
    });
    req.on('error', () => resolve({ ok: false, output: 'AI Free not running' }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false, output: 'timeout' }); });
  });
});

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
      ? require('child_process').spawn('cmd.exe', ['/c', 'hermes', '-p', 'aura-os', 'sessions', 'list', '--limit', '10'], { windowsHide: true })
      : require('child_process').spawn('hermes', ['-p', 'aura-os', 'sessions', 'list', '--limit', '10'], { windowsHide: true });
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
          ? require('child_process').spawn('cmd.exe', ['/c', 'hermes', '-p', 'aura-os', 'sessions', 'export', sessionId, '--format', 'json'], { windowsHide: true })
          : require('child_process').spawn('hermes', ['-p', 'aura-os', 'sessions', 'export', sessionId, '--format', 'json'], { windowsHide: true });
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
