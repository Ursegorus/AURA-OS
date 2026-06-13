/**
 * AURA OS — Agent registry and runner.
 * Agents are external CLI tools (Claude Code, Codex, Gemini CLI, Ollama, custom).
 * Each agent definition describes how to detect it and how to send it a prompt.
 */
const { spawn, execFile } = require('child_process');
const os = require('os');

const IS_WIN = process.platform === 'win32';

/** Built-in agent templates. `args` may contain {prompt} and {model} placeholders. */
const BUILTIN_AGENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    command: 'claude',
    args: ['-p', '{prompt}'],
    needsShell: false,
    detectArgs: ['--version'],
    skills: ['coding', 'architecture', 'refactoring', 'writing', 'planning', 'analysis'],
    roles: ['coordinator', 'coder', 'reviewer', 'writer'],
    color: '#d97757',
    builtin: true
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    vendor: 'OpenAI',
    command: 'codex',
    args: ['exec', '--skip-git-repo-check', '--'],
    stdinPrompt: true,
    needsShell: false,
    detectArgs: ['--version'],
    skills: ['coding', 'code-review', 'debugging', 'testing'],
    roles: ['coder', 'reviewer'],
    color: '#10a37f',
    builtin: true
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    vendor: 'Google',
    command: 'gemini',
    args: ['-p', '{prompt}'],
    needsShell: true,
    detectArgs: ['--version'],
    skills: ['coding', 'research', 'long-context', 'analysis'],
    roles: ['coder', 'researcher', 'reviewer'],
    color: '#4285f4',
    builtin: true
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    vendor: 'Nous Research',
    command: 'hermes',
    args: ['-z', '{prompt}', '--cli'],
    needsShell: false,
    detectArgs: ['--version'],
    skills: ['research', 'reasoning', 'tool-use'],
    roles: ['researcher', 'coder'],
    color: '#a78bfa',
    builtin: true
  },
  {
    id: 'ollama',
    name: 'Ollama (локальная модель)',
    vendor: 'Local',
    command: 'ollama',
    args: ['run', '{model}', '{prompt}'],
    needsShell: false,
    model: 'qwen2.5-coder',
    detectArgs: ['--version'],
    skills: ['coding', 'offline', 'privacy'],
    roles: ['coder', 'writer'],
    color: '#94a3b8',
    builtin: true
  }
];

class AgentManager {
  constructor(store, pro) {
    this.store = store; // settings store with .get/.set
    this.pro = pro || null; // Pro-модуль (опционально)
    this.running = new Map(); // runId -> child process
  }

  /** All agents = builtins merged with user overrides + custom agents. */
  getAgents() {
    const overrides = this.store.get('agentOverrides', {});
    const custom = this.store.get('customAgents', []);
    const merged = BUILTIN_AGENTS.map(a => ({ ...a, ...(overrides[a.id] || {}) }));
    const list = merged.concat(custom.map(c => ({ ...c, builtin: false })));
    // Pro-версия: дополняет агентов профилями (modelFlag, models)
    if (this.pro) {
      list.forEach(a => this.pro.patchAgentDef(a));
    }
    return list;
  }

  getAgent(id) {
    return this.getAgents().find(a => a.id === id);
  }

  addCustomAgent(def) {
    const custom = this.store.get('customAgents', []);
    const id = def.id || ('custom-' + Date.now());
    custom.push({
      id,
      name: def.name || id,
      vendor: def.vendor || 'Custom',
      command: def.command,
      args: Array.isArray(def.args) ? def.args : String(def.args || '{prompt}').split(' '),
      needsShell: def.needsShell !== undefined ? def.needsShell : IS_WIN,
      detectArgs: def.detectArgs || ['--version'],
      skills: def.skills || [],
      roles: def.roles || ['coder'],
      model: def.model || '',
      color: def.color || '#64748b'
    });
    this.store.set('customAgents', custom);
    return id;
  }

  removeCustomAgent(id) {
    const custom = this.store.get('customAgents', []).filter(a => a.id !== id);
    this.store.set('customAgents', custom);
  }

  updateAgent(id, patch) {
    const agent = this.getAgent(id);
    if (!agent) return;
    if (agent.builtin) {
      const overrides = this.store.get('agentOverrides', {});
      overrides[id] = { ...(overrides[id] || {}), ...patch };
      this.store.set('agentOverrides', overrides);
    } else {
      const custom = this.store.get('customAgents', []);
      const i = custom.findIndex(a => a.id === id);
      if (i >= 0) { custom[i] = { ...custom[i], ...patch }; this.store.set('customAgents', custom); }
    }
  }

  /** Detect whether the agent CLI is installed (resolves to {available, path|error}). */
  detect(agent) {
    return new Promise(resolve => {
      const finder = IS_WIN ? 'where' : 'which';
      execFile(finder, [agent.command], { shell: IS_WIN, windowsHide: true }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ id: agent.id, available: false });
        } else {
          resolve({ id: agent.id, available: true, path: stdout.trim().split(/\r?\n/)[0] });
        }
      });
    });
  }

  async detectAll() {
    const agents = this.getAgents();
    const results = await Promise.all(agents.map(a => this.detect(a)));
    const map = {};
    for (const r of results) map[r.id] = r;
    return map;
  }

  /**
   * Run a prompt on an agent. Streams output via onData(chunk).
   * Returns a promise resolving to { ok, output, code }.
   */
  run(agentId, prompt, { cwd, onData, timeoutMs = 15 * 60 * 1000, runId, model } = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) return Promise.resolve({ ok: false, output: 'Unknown agent: ' + agentId, code: -1 });

    let args = agent.args.map(a => {
      let s = a;
      if (agent.stdinPrompt) {
        s = s.replace('{prompt}', '');
      } else {
        s = s.replace('{prompt}', prompt);
      }
      return s.replace('{model}', model || agent.model || '');
    }).filter(a => a.length > 0);

    // Smart model routing: inject the model flag when a model is chosen and the
    // agent declares how to set it (and {model} isn't already part of its args).
    if (model && agent.modelFlag && !agent.args.some(a => a.includes('{model}'))) {
      args = [agent.modelFlag, model, ...args];
    }

    return new Promise(resolve => {
      let output = '';
      let settled = false;
      const child = spawn(agent.command, args, {
        cwd: cwd || os.homedir(),
        shell: agent.needsShell === undefined ? IS_WIN : agent.needsShell,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' }
      });
      if (runId) this.running.set(runId, child);

      const timer = setTimeout(() => {
        if (!settled) { try { child.kill(); } catch (_) {} }
      }, timeoutMs);

      const handle = (data) => {
        const text = data.toString();
        output += text;
        if (onData) onData(text);
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      // Передаём промпт через stdin если агент так настроен
      if (agent.stdinPrompt && prompt) {
        child.stdin.write(prompt);
      }
      child.stdin.end();

      const done = (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (runId) this.running.delete(runId);
        resolve({ ok: code === 0, output: output.trim(), code });
      };
      child.on('error', (err) => {
        output += '\n[AURA] spawn error: ' + err.message;
        done(-1);
      });
      child.on('close', done);
    });
  }

  cancel(runId) {
    const child = this.running.get(runId);
    if (child) { try { child.kill(); } catch (_) {} this.running.delete(runId); return true; }
    return false;
  }

  cancelAll() {
    for (const [, child] of this.running) { try { child.kill(); } catch (_) {} }
    this.running.clear();
  }
}

module.exports = { AgentManager, BUILTIN_AGENTS };
