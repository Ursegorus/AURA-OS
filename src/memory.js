/**
 * AURA OS — Shared memory backed by an Obsidian vault.
 * All agents read/write markdown notes in the vault, so the user can browse
 * the collective memory directly in Obsidian.
 */
const fs = require('fs');
const path = require('path');

const AURA_DIR = 'AURA';

class Memory {
  constructor(store) {
    this.store = store;
  }

  vaultPath() {
    return this.store.get('vaultPath', '');
  }

  isConfigured() {
    const p = this.vaultPath();
    return !!p && fs.existsSync(p);
  }

  auraDir() {
    const dir = path.join(this.vaultPath(), AURA_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  sanitize(name) {
    return name.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  /** Persist a completed task run as a markdown note. */
  saveTaskNote(task) {
    if (!this.isConfigured()) return null;
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(this.auraDir(), `${date} — ${this.sanitize(task.title)}.md`);
    const lines = [
      '---',
      `created: ${new Date().toISOString()}`,
      `status: ${task.status}`,
      `tags: [aura, task]`,
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
    return file;
  }

  /** Rolling index note so agents can recall recent work. */
  appendToIndex(task, noteName) {
    const file = path.join(this.auraDir(), 'Memory.md');
    let content = '';
    if (fs.existsSync(file)) content = fs.readFileSync(file, 'utf8');
    else content = '# AURA — Общая память агентов\n\nКаждая строка — выполненная задача. Агенты используют этот файл как контекст.\n\n';
    content += `\n- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | [[${noteName}]] | ${task.status} | ${task.input.slice(0, 160)}`;
    fs.writeFileSync(file, content, 'utf8');
  }

  /** Recent memory excerpt injected into planning prompts. */
  recentContext(maxChars = 2000) {
    if (!this.isConfigured()) return '';
    const file = path.join(this.auraDir(), 'Memory.md');
    if (!fs.existsSync(file)) return '';
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').filter(l => l.startsWith('- '));
    return lines.slice(-15).join('\n').slice(-maxChars);
  }

  /** List notes for the Memory view in the UI. */
  listNotes() {
    if (!this.isConfigured()) return [];
    const dir = this.auraDir();
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return { name: f, path: full, mtime: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  readNote(p) {
    const vault = path.resolve(this.vaultPath());
    const resolved = path.resolve(p);
    if (!resolved.startsWith(vault)) return '';
    return fs.readFileSync(resolved, 'utf8');
  }

  /** Поиск по всему vault через search_files. query — ключевые слова через |. */
  searchNotes(query) {
    if (!this.isConfigured()) return [];
    const { execFileSync } = require('child_process');
    const isWin = process.platform === 'win32';
    try {
      // Используем ripgrep (rg) через shell
      const cmd = `rg -l -g '*.md' '${query.replace(/'/g, "'\''")}' "${this.vaultPath()}" 2>nul || true`;
      const out = require('child_process').execSync(cmd, { windowsHide: true, encoding: 'utf8', shell: isWin });
      return out.split('\n').filter(Boolean).slice(0, 20).map(p => ({ path: p.trim() }));
    } catch (_) {
      // fallback: search_files tool
      return [];
    }
  }

  /** Контекст для задачи: ключевые слова → rg → топ-N заметок → текст. */
  searchContext(input, limit = 5) {
    if (!this.isConfigured() || !input) return '';
    const kw = this._keywords(input);
    if (kw.length === 0) return '';
    const pattern = kw.join('|');
    const matches = this.searchNotes(pattern);
    if (matches.length === 0) return '';

    // Ранжируем: название важнее, больше совпадений — выше
    const ranked = matches.map(m => {
      const name = path.basename(m.path).toLowerCase();
      let score = 0;
      for (const k of kw) { if (name.includes(k)) score += 3; }
      // Читаем первые 500 символов для подсчёта совпадений в тексте
      try {
        const content = fs.readFileSync(m.path, 'utf8').slice(0, 2000).toLowerCase();
        for (const k of kw) {
          const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const cnt = (content.match(re) || []).length;
          score += cnt;
        }
      } catch (_) {}
      return { ...m, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit);

    // Формируем блок контекста
    const ctx = ['\n\nИз базы знаний:'];
    for (const r of ranked) {
      try {
        const content = fs.readFileSync(r.path, 'utf8').slice(0, 3000);
        ctx.push('\n─── ' + path.relative(this.vaultPath(), r.path) + ' ───');
        ctx.push(content);
      } catch (_) {}
    }
    return ctx.join('\n');
  }

  /** Извлечь ключевые слова из строки. */
  _keywords(input) {
    const words = input.match(/[a-zA-Zа-яёА-ЯЁ_]\w+/g) || [];
    const stop = ['это', 'что', 'как', 'для', 'где', 'когда', 'зачем', 'который', 'чтобы', 'надо', 'нужно', 'может', 'также', 'будет', 'есть', 'тебя', 'себя', 'наш', 'ваш', 'все', 'том', 'the', 'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would'];
    return [...new Set(words.map(w => w.toLowerCase()))].filter(w => w.length > 2 && !stop.includes(w)).slice(0, 8);
  }

  /** Записать/создать .md в vault. */
  writeNote(relativePath, content) {
    if (!this.isConfigured()) return false;
    const full = path.resolve(path.join(this.vaultPath(), relativePath));
    if (!full.startsWith(path.resolve(this.vaultPath()))) return false;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return true;
  }

  /** Удалить .md из vault. */
  deleteNote(relativePath) {
    if (!this.isConfigured()) return false;
    const full = path.resolve(path.join(this.vaultPath(), relativePath));
    if (!full.startsWith(path.resolve(this.vaultPath()))) return false;
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return true;
  }
}

module.exports = { Memory };
