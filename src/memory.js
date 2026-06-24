/**
 * AURA OS — База знаний.
 *
 * Работает всегда, даже без Obsidian.
 * Если vault не указан — создаёт ~/.aura-knowledge/ или папку из настроек.
 * Все .md файлы совместимы с Obsidian.
 */
const fs = require('fs');
const path = require('path');

class Memory {
  constructor(store) {
    this.store = store;
  }

  /** Путь к базе знаний. Если vault не задан — своя папка. */
  basePath() {
    const vault = this.store.get('vaultPath', '');
    if (vault && fs.existsSync(vault)) return vault;
    // Своя папка: из настроек или ~/.aura-knowledge
    const kp = this.store.get('knowledgePath', '');
    if (kp && fs.existsSync(kp)) return kp;
    const home = require('os').homedir();
    const fallback = path.join(home, '.aura-knowledge');
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }

  isConfigured() { return true; }

  vaultPath() { return this.basePath(); }

  /** Папка AURA внутри базы. */
  auraDir() {
    const dir = path.join(this.basePath(), 'AURA');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  sanitize(name) {
    return name.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  saveTaskNote(task) {
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(this.auraDir(), `${date} — ${this.sanitize(task.title)}.md`);
    const lines = [
      '---',
      `created: ${new Date().toISOString()}`,
      `status: ${task.status}`,
      'tags: [aura, task]',
      '---',
      '',
      `# ${task.title}`,
      '',
      `**Задача:** ${task.input}`,
      ''
    ];
    for (const st of task.subtasks || []) {
      lines.push(`## ${st.title} — ${st.agentName || st.agent} (${st.role})`);
      lines.push('');
      lines.push('```');
      lines.push((st.output || '').slice(0, 8000));
      lines.push('```');
      lines.push('');
    }
    if (task.summary) {
      lines.push('## Итог');
      lines.push('');
      lines.push(task.summary);
    }
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    this.appendToIndex(task, path.basename(file, '.md'));
    this.buildGraph();
    return file;
  }

  appendToIndex(task, noteName) {
    const file = path.join(this.auraDir(), 'Memory.md');
    let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# AURA — База знаний\n\n';
    content += `\n- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | [[${noteName}]] | ${task.status} | ${task.input.slice(0, 160)}`;
    fs.writeFileSync(file, content, 'utf8');
  }

  recentContext(maxChars = 2000) {
    const file = path.join(this.auraDir(), 'Memory.md');
    if (!fs.existsSync(file)) return '';
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.startsWith('- '));
    return lines.slice(-15).join('\n').slice(-maxChars);
  }

  listNotes() {
    const dir = this.auraDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs, size: fs.statSync(path.join(dir, f)).size }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  readNote(p) {
    const base = path.resolve(this.basePath());
    const resolved = path.resolve(p);
    if (!resolved.startsWith(base)) return '';
    return fs.readFileSync(resolved, 'utf8');
  }

  /** Поиск по базе через rg. query — слова через |. */
  searchNotes(query) {
    const base = this.basePath();
    try {
      const cmd = `rg -l -g '*.md' '${query.replace(/'/g, "'\\''")}' "${base}" 2>nul || true`;
      const out = require('child_process').execSync(cmd, { windowsHide: true, encoding: 'utf8', shell: process.platform === 'win32' });
      return out.split('\n').filter(Boolean).slice(0, 20).map(p => ({ path: p.trim() }));
    } catch (_) { return []; }
  }

  searchContext(input, limit = 5) {
    if (!input) return '';
    const kw = this._keywords(input);
    if (kw.length === 0) return '';
    const matches = this.searchNotes(kw.join('|'));
    if (matches.length === 0) return '';

    const ranked = matches.map(m => {
      const name = path.basename(m.path).toLowerCase();
      let score = 0;
      for (const k of kw) { if (name.includes(k)) score += 3; }
      try {
        const content = fs.readFileSync(m.path, 'utf8').slice(0, 2000).toLowerCase();
        for (const k of kw) {
          score += (content.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        }
      } catch (_) {}
      return { ...m, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit);

    const ctx = ['\n\nИз базы знаний:'];
    for (const r of ranked) {
      try {
        ctx.push('\n─── ' + path.relative(this.basePath(), r.path) + ' ───');
        ctx.push(fs.readFileSync(r.path, 'utf8').slice(0, 3000));
      } catch (_) {}
    }
    return ctx.join('\n');
  }

  _keywords(input) {
    const words = input.match(/[a-zA-Zа-яёА-ЯЁ_]\w+/g) || [];
    const stop = ['это','что','как','для','где','когда','зачем','который','чтобы','надо','нужно','может','также','будет','есть','тебя','себя','наш','ваш','все','том','the','this','that','with','from','have','been','will','would'];
    return [...new Set(words.map(w => w.toLowerCase()))].filter(w => w.length > 2 && !stop.includes(w)).slice(0, 8);
  }

  writeNote(relativePath, content) {
    const full = path.resolve(path.join(this.basePath(), relativePath));
    if (!full.startsWith(path.resolve(this.basePath()))) return false;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    this.buildGraph();
    return true;
  }

  deleteNote(relativePath) {
    const full = path.resolve(path.join(this.basePath(), relativePath));
    if (!full.startsWith(path.resolve(this.basePath()))) return false;
    if (fs.existsSync(full)) fs.unlinkSync(full);
    this.buildGraph();
    return true;
  }

  // ====================== ГРАФ СВЯЗЕЙ ======================

  /** Сканирует все .md, находит [[wikilinks]], строит state/graph.json. */
  buildGraph() {
    try {
      const base = this.basePath();
      // Собираем все .md файлы
      const allMd = this._findAllMd(base);
      const nodes = [];
      const links = [];
      const nodeSet = new Set();

      for (const filepath of allMd) {
        const rel = path.relative(base, filepath).replace(/\.md$/i, '');
        const name = path.basename(filepath).replace(/\.md$/i, '');
        if (!nodeSet.has(rel)) {
          nodes.push({ id: rel, title: name, group: path.dirname(rel).split(path.sep)[0] || 'root' });
          nodeSet.add(rel);
        }

        // Ищем [[wikilinks]] в содержимом
        try {
          const content = fs.readFileSync(filepath, 'utf8');
          const wls = content.match(/\[\[([^\]]+)\]\]/g) || [];
          for (const wl of wls) {
            const target = wl.slice(2, -2).split('|')[0].trim();
            // Проверяем, существует ли такой файл (как .md или как папка/файл.md)
            const targetPath = this._resolveWikilink(base, target);
            if (targetPath && nodeSet.has(target)) {
              links.push({ source: rel, target, value: 1 });
            } else if (targetPath) {
              // Добавляем target как узел, даже если файла пока нет
              if (!nodeSet.has(target)) {
                nodes.push({ id: target, title: target, group: 'unlinked' });
                nodeSet.add(target);
              }
              links.push({ source: rel, target, value: 1 });
            }
          }
        } catch (_) {}
      }

      // Сохраняем graph.json
      const stateDir = path.join(base, 'AURA', 'state');
      if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, 'graph.json'), JSON.stringify({ nodes, links }, null, 2), 'utf8');
    } catch (_) { /* graph не критичен */ }
  }

  /** Сгенерировать HTML с vis-network графом. */
  getGraphHTML() {
    this.buildGraph();
    const graphPath = path.join(this.auraDir(), 'state', 'graph.json');
    if (!fs.existsSync(graphPath)) return '<p style="color:#666">Нет заметок для графа</p>';

    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    if (!graph.nodes || graph.nodes.length === 0) return '<p style="color:#666">Нет связей между заметками</p>';

    const colors = ['#6c8cff','#a78bfa','#22c55e','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'];
    const groupColors = {};
    let ci = 0;
    for (const n of graph.nodes) {
      if (!groupColors[n.group]) groupColors[n.group] = colors[ci++ % colors.length];
    }

    return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>Граф знаний</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"><\/script>
<style>body{margin:0;background:#0b0f17;color:#e2e8f0;font-family:sans-serif;overflow:hidden}
#graph{width:100vw;height:100vh}</style></head>
<body><div id="graph"></div>
<script>
const data = ${JSON.stringify(graph)};
const colors = ${JSON.stringify(groupColors)};
const nodes = new vis.DataSet(data.nodes.map(n => ({
  id: n.id, label: n.title, group: n.group,
  color: { background: colors[n.group]||'#64748b', border: '#1e293b' },
  borderWidth: 0, size: 12 + (n.id.includes('/')?0:4), font: { color: '#e2e8f0', size: 11 }
})));
const edges = new vis.DataSet(data.links.map(l => ({
  from: l.source, to: l.target, color: { color: '#334155', opacity: 0.4 }, width: 1
})));
new vis.Network(document.getElementById('graph'), { nodes, edges }, {
  physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.005 } },
  interaction: { hover: true, tooltipDelay: 200 }
});
<\/script></body></html>`;
  }

  _findAllMd(dir) {
    const results = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'raw' || entry.name === 'wiki' || entry.name === 'state') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...this._findAllMd(full));
        else if (entry.name.endsWith('.md')) results.push(full);
      }
    } catch (_) {}
    return results;
  }

  _resolveWikilink(base, target) {
    // Пробуем найти файл target.md или target/index.md
    const candidates = [
      path.join(base, target + '.md'),
      path.join(base, target, 'index.md')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }
}

module.exports = { Memory };
