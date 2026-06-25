/**
 * electron-builder afterPack hook — open-core Pro bundling.
 *
 * Если в node_modules установлен приватный пакет aura-pro, копируем его в
 * resources/aura-pro собранного приложения. Тогда orchestrator → loadPro()
 * найдёт его по process.resourcesPath.
 *
 * Если aura-pro не установлен (публичная CI-сборка) — хук ничего не делает,
 * получается чистое бесплатное ядро. Один конфиг работает для обеих сборок.
 */
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const src = path.join(__dirname, '..', 'node_modules', 'aura-pro');
  if (!fs.existsSync(src)) {
    console.log('[afterPack] aura-pro не установлен — собрано бесплатное ядро.');
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
  // node_modules самого aura-pro не нужен (нет зависимостей) — не копируем
  const nm = path.join(dest, 'node_modules');
  if (fs.existsSync(nm)) fs.rmSync(nm, { recursive: true, force: true });
  console.log('[afterPack] AURA Pro упакован → ' + dest);
};
