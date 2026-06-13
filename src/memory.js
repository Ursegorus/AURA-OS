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
    // only allow reading inside the vault
    const vault = path.resolve(this.vaultPath());
    const resolved = path.resolve(p);
    if (!resolved.startsWith(vault)) return '';
    return fs.readFileSync(resolved, 'utf8');
  }
}

module.exports = { Memory };
