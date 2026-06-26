/**
 * AURA OS — Персист истории задач и их логов.
 *
 * Зачем: задачи и их вывод жили только в памяти процесса — закрыл приложение,
 * история и логи пропали (боль B, приоритет №2). Плюс прогон агентов вообще не
 * писался на диск (вывод шёл только в живую панель UI), поэтому разобрать
 * сбойную задачу было нечем. Этот модуль централизованно перехватывает события
 * оркестратора (через dispatchEvent в main.js) и пишет:
 *   - индекс задач → <logs>/tasks.json     (метаданные + результат, последние MAX)
 *   - полный лог   → <logs>/tasks/<id>.log  (синхронная дозапись, переживает краш)
 */
const fs = require('fs');
const path = require('path');

const MAX_TASKS = 200;                    // сколько задач храним в индексе
const MAX_LOG_BYTES = 2 * 1024 * 1024;    // потолок на лог одной задачи (2 МБ)
const FLUSH_MS = 800;                     // дебаунс записи индекса (task-updated сыпется часто)
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'error', 'completed', 'finished', 'approved']);

let tasksDir = null;    // <userData>/logs/tasks
let indexFile = null;   // <userData>/logs/tasks.json
let index = new Map();  // id -> public task (+ updatedAt)
let dirty = false;
let timer = null;

function logPath(id) {
  // id генерится из префикса+seq+ts, но всё равно санитизируем под имя файла
  const safe = String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(tasksDir, safe + '.log');
}

/** Инициализация. dir — папка логов (та же, что у logger: <userData>/logs). */
function init(dir) {
  tasksDir = path.join(dir, 'tasks');
  indexFile = path.join(dir, 'tasks.json');
  try { if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true }); } catch (_) {}
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw && raw.tasks) || [];
    for (const t of arr) if (t && t.id) index.set(t.id, t);
  } catch (_) { /* нет файла / битый — стартуем с чистого индекса */ }
  return module.exports;
}

function flush() {
  if (!indexFile || !dirty) return;
  dirty = false;
  let arr = Array.from(index.values())
    .sort((a, b) => (b.startedAt || b.updatedAt || 0) - (a.startedAt || a.updatedAt || 0));
  if (arr.length > MAX_TASKS) {
    const drop = arr.slice(MAX_TASKS);
    arr = arr.slice(0, MAX_TASKS);
    index = new Map(arr.map(t => [t.id, t]));
    for (const t of drop) { try { fs.unlinkSync(logPath(t.id)); } catch (_) {} }
  }
  try { fs.writeFileSync(indexFile, JSON.stringify(arr)); } catch (_) {}
}

function scheduleFlush(now) {
  dirty = true;
  if (now) { if (timer) { clearTimeout(timer); timer = null; } flush(); return; }
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
}

/** Перехват события оркестратора. Безопасно — все ошибки глотаются. */
function record(event) {
  if (!tasksDir || !event) return;
  try {
    if (event.type === 'task-created' || event.type === 'task-updated') {
      const task = event.task;
      if (!task || !task.id) return;
      task.updatedAt = Date.now();
      index.set(task.id, task);
      scheduleFlush(TERMINAL.has(task.status));
    } else if (event.type === 'log') {
      if (!event.taskId || !event.text) return;
      const f = logPath(event.taskId);
      try {
        const st = fs.statSync(f);
        if (st.size > MAX_LOG_BYTES) {
          // переполнение — оставляем хвост
          const tail = fs.readFileSync(f).slice(-Math.floor(MAX_LOG_BYTES / 2));
          fs.writeFileSync(f, tail);
        }
      } catch (_) { /* файла ещё нет */ }
      fs.appendFileSync(f, event.text);
    }
  } catch (_) { /* персист не должен ронять оркестрацию */ }
}

/** Сохранённые задачи, свежие первыми. */
function history(limit = MAX_TASKS) {
  return Array.from(index.values())
    .sort((a, b) => (b.startedAt || b.updatedAt || 0) - (a.startedAt || a.updatedAt || 0))
    .slice(0, limit);
}

/** Слить живые задачи с историей (живые имеют приоритет по id). */
function mergeHistory(live, limit = MAX_TASKS) {
  const ids = new Set((live || []).map(t => t.id));
  const merged = [...(live || [])];
  for (const t of history()) if (!ids.has(t.id)) merged.push(t);
  return merged
    .sort((a, b) => (b.startedAt || b.updatedAt || 0) - (a.startedAt || a.updatedAt || 0))
    .slice(0, limit);
}

/** Хвост лога одной задачи. */
function taskLog(id, maxBytes = 60000) {
  try { return fs.readFileSync(logPath(id)).slice(-maxBytes).toString('utf8'); }
  catch (_) { return ''; }
}

/** Карта { id: хвост_лога } для набора задач — для восстановления state.logs в UI. */
function logsFor(ids, perTaskBytes = 12000) {
  const out = {};
  for (const id of ids || []) { const l = taskLog(id, perTaskBytes); if (l) out[id] = l; }
  return out;
}

/** Полная очистка истории (индекс + файлы логов). */
function clear() {
  index = new Map();
  dirty = false;
  if (timer) { clearTimeout(timer); timer = null; }
  try { fs.writeFileSync(indexFile, '[]'); } catch (_) {}
  try { for (const f of fs.readdirSync(tasksDir)) fs.unlinkSync(path.join(tasksDir, f)); } catch (_) {}
}

module.exports = { init, record, history, mergeHistory, taskLog, logsFor, clear };
