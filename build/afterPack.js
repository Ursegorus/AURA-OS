/**
 * electron-builder afterPack hook — bundle optional local extensions.
 *
 * Если в node_modules установлен пакет aura-pro (локальные расширения:
 * маршрутизация моделей, доп. паттерны харнеса, self-improving loop),
 * копируем его в resources/aura-pro собранного приложения, чтобы
 * orchestrator → loadPro() нашёл его по process.resourcesPath.
 *
 * Если пакет не установлен — хук ничего не делает. Один конфиг для обеих сборок.
 */
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const src = path.join(__dirname, '..', 'node_modules', 'aura-pro');
  if (!fs.existsSync(src)) {
    console.log('[afterPack] локальные расширения не установлены — собрано базовое ядро.');
    return;
  }
  let resourcesDir;
  try {
    resourcesDir = context.packager.getResourcesDir(context.appOutDir);
  } catch (_) {
    // запасной путь для win/linux
    resourcesDir = path.join(context.appOutDir, 'resources');
  }
  const dest = path.join(resourcesDir, 'aura-pro');
  fs.cpSync(src, dest, { recursive: true });
  // node_modules самого пакета не нужен (нет зависимостей) — не копируем
  const nm = path.join(dest, 'node_modules');
  if (fs.existsSync(nm)) fs.rmSync(nm, { recursive: true, force: true });
  console.log('[afterPack] локальные расширения упакованы → ' + dest);
};
