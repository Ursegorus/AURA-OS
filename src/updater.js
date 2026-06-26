/**
 * AURA OS — авто-обновление через GitHub Releases (electron-updater).
 *
 * Принципы:
 *   - работает ТОЛЬКО в установленной (NSIS) сборке; в dev и в portable —
 *     no-op (portable физически не умеет себя обновлять);
 *   - авто-скачивание включено, установка — по кнопке пользователя
 *     (quitAndInstall), плюс автоустановка при следующем выходе;
 *   - статус транслируется в renderer событием 'update:status'.
 */
const { app } = require('electron');

let autoUpdater = null;
let _win = null;
let _state = { status: 'idle', current: app.getVersion(), version: '', progress: 0, error: '' };

function send() {
  try { if (_win && !_win.isDestroyed()) _win.webContents.send('update:status', _state); } catch (_) {}
}
function set(patch) { _state = { ..._state, ...patch }; send(); }

// electron-builder выставляет эту переменную для portable-сборки.
function isPortable() { return !!process.env.PORTABLE_EXECUTABLE_DIR; }

function init(win) {
  _win = win;
  if (!app.isPackaged) { _state.status = 'dev'; return; }
  if (isPortable()) { _state.status = 'portable'; return; }
  try { autoUpdater = require('electron-updater').autoUpdater; }
  catch (e) { set({ status: 'unavailable', error: String((e && e.message) || e) }); return; }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
  autoUpdater.on('update-available', (info) => set({ status: 'available', version: (info && info.version) || '' }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', progress: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded', (info) => set({ status: 'downloaded', version: (info && info.version) || '' }));
  autoUpdater.on('error', (err) => set({ status: 'error', error: String((err && err.message) || err) }));

  // Проверка при старте — с задержкой, чтобы не конкурировать со сплэшем/настройкой.
  setTimeout(() => check(), 8000);
}

function check() {
  if (!autoUpdater) { send(); return _state; }
  try { autoUpdater.checkForUpdates(); } catch (e) { set({ status: 'error', error: String((e && e.message) || e) }); }
  return _state;
}

function install() {
  if (!autoUpdater) return false;
  try { autoUpdater.quitAndInstall(); return true; }
  catch (e) { set({ status: 'error', error: String((e && e.message) || e) }); return false; }
}

function state() { return _state; }

module.exports = { init, check, install, state };
