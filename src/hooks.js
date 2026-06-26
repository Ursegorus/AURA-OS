/**
 * AURA OS — Hooks: enforced-гарантии безопасности.
 *
 * Важно про архитектуру: AURA оркестрирует ВНЕШНИЕ CLI-агенты (Claude Code,
 * opencode и т.д.). Их внутренние вызовы инструментов (bash/запись файлов) идут
 * внутри их собственного процесса — AURA их не перехватывает (это не Hermes,
 * который сам является рантаймом агента). Поэтому enforced-хуки применяются там,
 * где shell исполняет САМА AURA:
 *   - Telegram-терминал (= удалённый shell, главный риск),
 *   - backpressure-команды Ralph-лупа,
 *   - любые команды, которые AURA запускает от своего имени.
 *
 * Для внешних агентов граница рабочей папки остаётся промпт-директивой
 * (см. harness `_withConstraints`) — честно, без переобещаний.
 *
 * Контракт guardCommand(cmd) → { level: 'allow'|'confirm'|'block', reason }.
 */

// Жёсткий блок — команды, которые почти наверняка катастрофа. Не выполняем никогда.
const HARD_BLOCK = [
  { re: /\brm\s+-[rf]{1,2}[a-z]*\s+(\/|~|\$HOME|\*)(\s|$)/i, why: 'rm -rf корня/домашней/всего' },
  { re: /\brm\s+-[rf]{1,2}[a-z]*\s+\/\S*/i, why: 'rm -rf по абсолютному пути от корня' },
  { re: /\bmkfs(\.\w+)?\b/i, why: 'форматирование ФС (mkfs)' },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|disk)/i, why: 'запись dd на диск' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: 'выключение/перезагрузка системы' },
  { re: /\bformat\s+[a-z]:/i, why: 'format диска (Windows)' },
  { re: /Remove-Item\b[^\n]*-Recurse[^\n]*-Force[^\n]*[\\/](\*|Windows|Users|System32)\b/i, why: 'Remove-Item -Recurse -Force по системным путям' },
  { re: /\bdel\s+\/[sqf]\b[^\n]*[\\/](Windows|Users)\b/i, why: 'del /s по системным путям' },
  { re: /:\s*\(\s*\)\s*\{[^\n]*\}\s*;\s*:/, why: 'fork-bomb' },
  { re: /\b(curl|wget|iwr|irm)\b[^\n|]*\|\s*(sh|bash|zsh|powershell|pwsh|iex)\b/i, why: 'pipe-to-shell (скачать и выполнить)' },
  { re: />\s*\/dev\/(sd|nvme|disk)/i, why: 'перезапись блочного устройства' },
];

// Требует подтверждения — деструктивно, но бывает легитимно.
const CONFIRM = [
  { re: /\brm\s+-[rf]/i, why: 'рекурсивное удаление (rm -r/-f)' },
  { re: /Remove-Item\b[^\n]*-Recurse/i, why: 'рекурсивное удаление (Remove-Item -Recurse)' },
  { re: /\bdel\s+\/[sq]/i, why: 'удаление каталога (del /s)' },
  { re: /\brmdir\b[^\n]*\/s/i, why: 'удаление каталога (rmdir /s)' },
  { re: /\bgit\s+reset\s+--hard/i, why: 'git reset --hard (потеря изменений)' },
  { re: /\bgit\s+clean\s+-[a-z]*f/i, why: 'git clean -f (удаление неотслеживаемых)' },
  { re: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i, why: 'удаление таблицы/БД' },
  { re: /\bkill(all)?\s+-9\b/i, why: 'принудительное завершение процессов' },
  { re: /\bgit\s+push\b[^\n]*--force/i, why: 'git push --force' },
];

/** Проверка команды перед исполнением самой AURA. */
function guardCommand(command) {
  const cmd = String(command || '');
  if (!cmd.trim()) return { level: 'allow' };
  for (const r of HARD_BLOCK) if (r.re.test(cmd)) return { level: 'block', reason: r.why };
  for (const r of CONFIRM) if (r.re.test(cmd)) return { level: 'confirm', reason: r.why };
  return { level: 'allow' };
}

module.exports = { guardCommand };
