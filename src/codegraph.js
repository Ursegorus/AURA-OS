/**
 * AURA OS — Нативный лёгкий граф зависимостей кода.
 *
 * Зачем: дать агенту «карту связей» рабочего проекта, чтобы он читал только
 * связанные файлы (экономия токенов + меньше ошибок) — идея graphify, но без
 * самого graphify. Принципиально:
 *   - чистый Node, без зависимостей, без LLM;
 *   - считается по рабочей папке НА ЛЕТУ;
 *   - НИЧЕГО не пишет ни в базу знаний, ни на диск (только в памяти).
 *
 * Это НЕ полный graphify (нет community detection / embeddings / артефактов).
 * Только то, что реально помогает агенту: импорт-граф локальных файлов.
 */
const fs = require('fs');
const path = require('path');

const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.py', '.go', '.rs', '.java', '.rb', '.php']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'vendor', '__pycache__', '.venv', 'venv', 'coverage', '.cache', 'target', '.idea', '.vscode']);
const JS_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'];

/** Достать спецификаторы импортов из исходника по расширению. */
function extractSpecs(src, ext) {
  const specs = [];
  const add = (re) => { let m; while ((m = re.exec(src))) specs.push(m[1]); };
  if (ext === '.py') {
    add(/^\s*from\s+([.\w]+)\s+import/gm);
    add(/^\s*import\s+([.\w]+)/gm);
  } else { // JS/TS-семейство (и vue/svelte с <script>)
    add(/import\s+[^'"]*from\s*['"]([^'"]+)['"]/g);
    add(/import\s*['"]([^'"]+)['"]/g);
    add(/export\s+[^'"]*from\s*['"]([^'"]+)['"]/g);
    add(/require\(\s*['"]([^'"]+)['"]\s*\)/g);
    add(/import\(\s*['"]([^'"]+)['"]\s*\)/g);
  }
  return specs;
}

/** Разрешить спецификатор в локальный файл из набора (repo-relative, '/'). */
function resolveSpec(spec, fromRel, fileSet, ext) {
  const norm = (p) => p.split(path.sep).join('/').replace(/\/+/g, '/');
  if (ext === '.py') {
    // Относительные .mod / ..pkg.mod и абсолютные pkg.mod → путь к .py
    let base;
    if (spec.startsWith('.')) {
      const ups = spec.match(/^\.+/)[0].length;
      let dir = path.posix.dirname(fromRel);
      for (let i = 1; i < ups; i++) dir = path.posix.dirname(dir);
      base = path.posix.join(dir, spec.replace(/^\.+/, '').replace(/\./g, '/'));
    } else {
      base = spec.replace(/\./g, '/');
    }
    for (const cand of [base + '.py', base + '/__init__.py']) if (fileSet.has(norm(cand))) return norm(cand);
    return null;
  }
  // JS/TS: интересуют только относительные импорты (локальные файлы)
  if (!spec.startsWith('.')) return null;
  const dir = path.posix.dirname(fromRel);
  const base = norm(path.posix.join(dir, spec));
  const cands = [base];
  for (const e of JS_EXTS) cands.push(base + e);
  for (const e of JS_EXTS) cands.push(base + '/index' + e);
  for (const c of cands) if (fileSet.has(c)) return c;
  return null;
}

/** Построить граф импортов рабочей папки (в памяти). */
function buildGraph(root, { maxFiles = 600 } = {}) {
  const files = [];
  (function walk(dir) {
    if (files.length >= maxFiles) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (files.length >= maxFiles) return;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('.')) walk(full); }
      else if (CODE_EXTS.has(path.extname(e.name))) files.push(full);
    }
  })(root);

  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const fileSet = new Set(files.map(rel));
  const edges = new Map();
  for (const f of files) {
    const r = rel(f);
    let src = ''; try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const ext = path.extname(f);
    const deps = new Set();
    for (const spec of extractSpecs(src, ext)) {
      const res = resolveSpec(spec, r, fileSet, ext);
      if (res && res !== r) deps.add(res);
    }
    edges.set(r, deps);
  }
  return { root, files: [...fileSet], edges };
}

/** Степень узла (in+out) для поиска «god-nodes». */
function degrees(graph) {
  const deg = new Map();
  const bump = (k, n) => deg.set(k, (deg.get(k) || 0) + n);
  for (const [f, deps] of graph.edges) { bump(f, deps.size); for (const d of deps) bump(d, 1); }
  return deg;
}

/**
 * Компактная карта связей для промпта. seeds — файлы, упомянутые в задаче.
 * Возвращает '' если кода мало (нет смысла) или превышен лимит.
 */
function codeContext(graph, seeds = [], maxChars = 1500) {
  if (!graph || graph.files.length < 3) return '';
  const deg = degrees(graph);
  const top = [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  const show = [...new Set([...(seeds || []), ...top])].slice(0, 12);
  const lines = [];
  for (const f of show) {
    const deps = [...(graph.edges.get(f) || [])];
    lines.push(deps.length ? `${f} → ${deps.slice(0, 6).join(', ')}` : f);
  }
  let out = lines.join('\n');
  if (out.length > maxChars) out = out.slice(0, maxChars) + '…';
  return out;
}

/** Найти файлы графа, упомянутые в тексте задачи (по имени/пути). */
function seedsFromText(graph, text) {
  if (!graph) return [];
  const s = String(text || '').toLowerCase();
  const seeds = [];
  for (const f of graph.files) {
    const base = f.split('/').pop().toLowerCase();
    const noExt = base.replace(/\.[^.]+$/, '');
    if (s.includes(f.toLowerCase()) || (base.length > 3 && s.includes(base)) ||
        (noExt.length > 3 && new RegExp('\\b' + noExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(s))) {
      seeds.push(f);
    }
  }
  return seeds.slice(0, 6);
}

module.exports = { buildGraph, codeContext, seedsFromText, degrees };
