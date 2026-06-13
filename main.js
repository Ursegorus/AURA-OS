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

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
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
}

app.whenReady().then(() => {
  createWindow();
  telegram.restart().catch(() => {}); // keep the remote terminal online for the app's lifetime
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

ipcMain.handle('task:start', (_e, input) => orchestrator.startTask(input));
ipcMain.handle('task:cancel', (_e, id) => orchestrator.cancelTask(id));
ipcMain.handle('task:list', () => orchestrator.listTasks());

ipcMain.handle('settings:get', () => ({
  vaultPath: store.get('vaultPath', ''),
  workspace: store.get('workspace', ''),
  coordinator: store.get('coordinator', 'claude-code'),
  maxParallel: store.get('maxParallel', 3),
  maxFixRounds: store.get('maxFixRounds', 2),
  reviewEnabled: store.get('reviewEnabled', true),
  smartRouting: store.get('smartRouting', false),
  lang: store.get('lang', 'ru'),
  telegramEnabled: store.get('telegramEnabled', false),
  telegramToken: store.get('telegramToken', ''),
  telegramAllowed: store.get('telegramAllowed', '')
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
