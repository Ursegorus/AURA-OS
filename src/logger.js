/**
 * AURA OS — Файловый логгер.
 *
 * Пишет в <userData>/logs/aura-YYYY-MM-DD.log и дублирует в консоль.
 * Перехватывает console.log/warn/error, ловит необработанные исключения.
 * Нужен, чтобы у собранного приложения вообще были логи (иначе console
 * уходит в никуда), и чтобы можно было разбирать жалобы пользователей.
 */
const fs = require('fs');
const path = require('path');

let logDir = null;
let logFile = null;
let installed = false;

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

/** Локальная дата YYYY-MM-DD (для имени файла лога). */
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Локальный таймстемп YYYY-MM-DD HH:mm:ss.SSS (в часовом поясе машины). */
function ts() {
  const d = new Date();
  return `${localDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Гарантирует папку и актуальный (по дате) путь к файлу лога. */
function ensurePath() {
  if (!logDir) return null;
  const day = localDay();
  logFile = path.join(logDir, `aura-${day}.log`);
  try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); }
  catch (_) {}
  return logFile;
}

function write(level, args) {
  const line = `[${ts()}] [${level}] ` + args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch (_) { return String(a); } }
    return String(a);
  }).join(' ') + '\n';
  // Синхронная дозапись: лог переживает жёсткий краш (именно ради этого он и нужен).
  const f = ensurePath();
  if (f) { try { fs.appendFileSync(f, line); } catch (_) {} }
  return line;
}

const logger = {
  /** Инициализация. dir — папка для логов (обычно userData/logs). */
  init(dir) {
    if (installed) return logger;
    logDir = dir;
    ensurePath();

    // Перехват console.* — оригиналы сохраняем, чтобы дублировать в stdout.
    const orig = {};
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      orig[level] = console[level] ? console[level].bind(console) : () => {};
      console[level] = (...args) => {
        write(level.toUpperCase(), args);
        try { orig[level](...args); } catch (_) {}
      };
    }

    // Необработанные ошибки и отклонённые промисы — главные источники
    // «приложение висит / падает молча».
    process.on('uncaughtException', (err) => {
      write('FATAL', ['uncaughtException:', err]);
      try { orig.error('uncaughtException:', err); } catch (_) {}
    });
    process.on('unhandledRejection', (reason) => {
      write('FATAL', ['unhandledRejection:', reason]);
      try { orig.error('unhandledRejection:', reason); } catch (_) {}
    });

    installed = true;
    write('INFO', ['===== AURA OS log start =====']);
    write('INFO', [`platform=${process.platform} pid=${process.pid} node=${process.version}`]);
    return logger;
  },

  /** Прямая запись события (помимо console). */
  event(tag, msg) { write('EVENT', [tag, msg]); },

  file() { return logFile; },
  dir() { return logDir; },

  /** Последние n строк текущего лога — для показа в UI. */
  tail(n = 500) {
    try {
      if (!logFile || !fs.existsSync(logFile)) return '';
      const all = fs.readFileSync(logFile, 'utf8').split('\n');
      return all.slice(-n).join('\n');
    } catch (_) { return ''; }
  }
};

module.exports = { logger };
