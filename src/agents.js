/**
 * AURA OS — Agent registry and runner.
 * Agents are external CLI tools (Claude Code, Codex, Gemini CLI, Ollama, custom).
 * Each agent definition describes how to detect it and how to send it a prompt.
 */
const { spawn, execFile } = require('child_process');
const os = require('os');
const fs = require('fs');

const IS_WIN = process.platform === 'win32';

/**
 * Built-in agent templates. `args` may contain {prompt} and {model} placeholders.
 *
 * Поля честности (для UI и keyless-сценария):
 *   keyless        — работает БЕЗ ключей/аккаунта сразу после установки CLI;
 *   requirement    — что нужно сделать, чтобы агент заработал (показываем в карточке);
 *   installHint    — npm-пакет для установки «в один клик» (null = ставится не через npm);
 *   uninstallHint  — npm-пакет для удаления (обычно = installHint);
 *   setupUrl       — ссылка на инструкцию/установку (для не-npm агентов).
 *
 * ВАЖНО про keyless: единственный мгновенный keyless-источник — OpenCode на
 * бесплатных моделях `opencode/*-free` (проверено: отвечает без credentials).
 * Поэтому из коробки идут ДВА агента на free-моделях OpenCode (coder + reviewer) —
 * этого достаточно для мультиагентной работы без единого ключа.
 */
const BUILTIN_AGENTS = [
  {
    id: 'opencode',
    name: 'OpenCode · DeepSeek (free)',
    vendor: 'Anomaly',
    command: 'opencode',
    // -m задаёт бесплатную модель (иначе берётся дефолтная, требующая входа);
    // --dangerously-skip-permissions авто-подтверждает действия в headless-режиме.
    args: ['run', '-m', '{model}', '--dangerously-skip-permissions', '{prompt}'],
    model: 'opencode/deepseek-v4-flash-free',
    stdinPrompt: true,
    needsShell: false,
    detectArgs: ['--version'],
    installHint: 'opencode-ai',
    uninstallHint: 'opencode-ai',
    keyless: true,
    requirement: 'Готов сразу — бесплатная модель OpenCode, без ключей. Бесплатные модели лимитированы и слабее в создании файлов: хороши для ответов, черновиков и планов; для серьёзных сборок подключите Claude/Codex.',
    skills: ['coding', 'architecture', 'refactoring', 'planning', 'debugging', 'testing'],
    roles: ['coder', 'coordinator', 'researcher'],
    color: '#22c55e',
    builtin: true
  },
  {
    id: 'opencode-nemotron',
    name: 'OpenCode · Nemotron (free)',
    vendor: 'Anomaly',
    command: 'opencode',
    args: ['run', '-m', '{model}', '--dangerously-skip-permissions', '{prompt}'],
    model: 'opencode/nemotron-3-ultra-free',
    stdinPrompt: true,
    needsShell: false,
    detectArgs: ['--version'],
    installHint: 'opencode-ai',
    uninstallHint: 'opencode-ai',
    keyless: true,
    requirement: 'Готов сразу — вторая бесплатная модель OpenCode (для ревью), без ключей. Та же оговорка: free-модели лимитированы, под лёгкие задачи и проверку.',
    skills: ['code-review', 'debugging', 'testing', 'analysis', 'reasoning'],
    roles: ['reviewer', 'coder'],
    color: '#16a34a',
    builtin: true
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    command: 'claude',
    // -p: headless print mode. --dangerously-skip-permissions: в headless-режиме
    // агент не может спросить разрешение, поэтому без этого флага он отказывается
    // править файлы и запускать команды. addDirFlag даёт доступ к папкам вне cwd.
    args: ['-p', '--dangerously-skip-permissions', '{prompt}'],
    addDirFlag: '--add-dir',
    stdinPrompt: true,
    needsShell: false,
    detectArgs: ['--version'],
    installHint: '@anthropic-ai/claude-code',
    uninstallHint: '@anthropic-ai/claude-code',
    keyless: false,
    requirement: 'Нужна подписка Claude (Pro/Max) или API-ключ. После установки откройте терминал, выполните `claude` и войдите.',
    setupUrl: 'https://www.anthropic.com/claude-code',
    skills: ['coding', 'architecture', 'refactoring', 'writing', 'planning', 'analysis', 'web-search'],
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
    installHint: '@openai/codex',
    uninstallHint: '@openai/codex',
    keyless: false,
    requirement: 'Нужен аккаунт ChatGPT (Plus и выше) или API-ключ OpenAI. После установки выполните `codex` и войдите.',
    setupUrl: 'https://github.com/openai/codex',
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
    // gemini — .cmd-шим на Windows, нужен shell, а shell режет промпт по пробелам.
    // Поэтому промпт идём через stdin (gemini дописывает stdin к значению -p),
    // -p получает заглушку «.», --skip-trust снимает гейт доверия папке,
    // --approval-mode yolo авто-подтверждает инструменты в headless-режиме.
    args: ['-p', '.', '--skip-trust', '--approval-mode', 'yolo'],
    stdinPrompt: true,
    needsShell: true,
    detectArgs: ['--version'],
    installHint: '@google/gemini-cli',
    uninstallHint: '@google/gemini-cli',
    keyless: false,
    requirement: 'Нужен вход в Google-аккаунт (`gemini` → браузер, без карты). Бесплатный тариф сильно лимитирован (немного запросов в минуту/день) — для объёмной работы нужен платный API-ключ.',
    setupUrl: 'https://github.com/google-gemini/gemini-cli',
    skills: ['coding', 'research', 'long-context', 'analysis', 'web-search'],
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
    installHint: 'hermes-agent',
    uninstallHint: 'hermes-agent',
    keyless: false,
    requirement: 'Опциональный движок. Требует настройки провайдера/ключа в Hermes. Для базовой работы не нужен.',
    setupUrl: 'https://github.com/NousResearch/hermes-agent',
    skills: ['research', 'reasoning', 'tool-use', 'code-review', 'web-search'],
    roles: ['researcher', 'coder', 'reviewer', 'coordinator'],
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
    installHint: null, // ставится не через npm — отдельный установщик
    uninstallHint: null,
    keyless: true,
    requirement: 'Без ключей, но локально: установите Ollama и скачайте модель — `ollama pull qwen2.5-coder` (несколько ГБ, нужно железо).',
    setupUrl: 'https://ollama.com/download',
    skills: ['coding', 'offline', 'privacy'],
    roles: ['coder', 'writer'],
    color: '#94a3b8',
    builtin: true
  },
  {
    id: 'kimi-code',
    name: 'Kimi Code',
    vendor: 'Moonshot AI',
    command: 'kimi',
    args: ['code', '--prompt', '{prompt}'],
    needsShell: false,
    detectArgs: ['--version'],
    installHint: null,
    uninstallHint: null,
    keyless: false,
    requirement: 'Нужен API-ключ Moonshot AI. Установка и вход — по инструкции Kimi.',
    setupUrl: 'https://platform.moonshot.ai',
    skills: ['coding', 'architecture', 'refactoring', 'planning', 'web-search', 'analysis'],
    roles: ['coder', 'reviewer', 'researcher'],
    color: '#6366f1',
    builtin: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (API)',
    vendor: 'OpenRouter',
    // Не CLI, а HTTP-провайдер (OpenAI-совместимый). Один ключ → много моделей
    // (DeepSeek/Opus/Gemini/…), оплата криптой — актуально для РФ. Снимает лимиты
    // и стоимость: дешёвая модель тянет рутину. Модели НЕ умеют сами писать файлы
    // и ходить в веб — это «мозг» для планирования/ресёрча/критики, не исполнитель.
    api: 'openrouter',
    command: null,
    model: 'deepseek/deepseek-chat',
    keyless: false,
    requirement: 'Нужен API-ключ OpenRouter (Settings → OpenRouter). Один ключ на все модели, пополнение криптой. Используется как «мозг» (план/ресёрч/критика), файлы пишет CLI-агент.',
    setupUrl: 'https://openrouter.ai/keys',
    skills: ['planning', 'reasoning', 'analysis', 'writing', 'review', 'research'],
    roles: ['coordinator', 'reviewer', 'researcher', 'writer'],
    color: '#8b5cf6',
    builtin: true
  }
];

class AgentManager {
  constructor(store) {
    this.store = store; // settings store with .get/.set
    this.running = new Map(); // runId -> child process
  }

  /** All agents = builtins merged with user overrides + custom agents. */
  getAgents() {
    const overrides = this.store.get('agentOverrides', {});
    const custom = this.store.get('customAgents', []);
    const merged = BUILTIN_AGENTS.map(a => ({ ...a, ...(overrides[a.id] || {}) }));
    const list = merged.concat(custom.map(c => ({ ...c, builtin: false })));
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

  /** Detect whether the agent CLI is installed (resolves to {available, path|error}).
   *  Двухступенчато: сначала where/which, затем — если не нашлось — реальная
   *  проба `<command> --version` через shell. Это убирает ложные «не установлен»
   *  для агентов вроде Hermes, чей .cmd-шим иногда не виден через where. */
  /**
   * Ключ OpenRouter: переиспользуем уже существующий, чтобы не вводить дважды.
   * Приоритет: настройка AURA → env OPENROUTER_API_KEY → конфиги Hermes и пр.
   * (ключи OpenRouter имеют префикс sk-or-, ищем по нему — не зависим от схемы).
   */
  _resolveOpenRouterKey() {
    const explicit = this.store.get('openrouterKey', '');
    if (explicit) return explicit;
    if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
    try {
      const os = require('os'), p = require('path');
      const home = os.homedir();
      const candidates = [
        p.join(home, '.hermes', 'config.toml'), p.join(home, '.hermes', 'hermes.toml'),
        p.join(home, '.hermes', 'config.yaml'), p.join(home, '.hermes', '.env'),
        p.join(home, '.config', 'hermes', 'config.toml')
      ];
      for (const f of candidates) {
        try { const m = fs.readFileSync(f, 'utf8').match(/sk-or-[A-Za-z0-9\-_]+/); if (m) return m[0]; } catch (_) {}
      }
    } catch (_) {}
    return '';
  }

  detect(agent) {
    // API-провайдеры (OpenRouter и т.п.) не CLI — «доступны», если найден ключ.
    if (agent.api === 'openrouter') {
      const has = !!this._resolveOpenRouterKey();
      return Promise.resolve({ id: agent.id, available: has, path: has ? 'openrouter.ai' : undefined });
    }
    return new Promise(resolve => {
      const finder = IS_WIN ? 'where' : 'which';
      execFile(finder, [agent.command], { shell: IS_WIN, windowsHide: true }, (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          return resolve({ id: agent.id, available: true, path: stdout.trim().split(/\r?\n/)[0] });
        }
        const probe = (agent.detectArgs && agent.detectArgs.length) ? agent.detectArgs : ['--version'];
        execFile(agent.command, probe, { shell: true, windowsHide: true, timeout: 8000 }, (err2, out2, errOut) => {
          if (!err2 || /\d+\.\d+/.test(String(out2 || '') + String(errOut || ''))) {
            resolve({ id: agent.id, available: true, path: agent.command });
          } else {
            resolve({ id: agent.id, available: false });
          }
        });
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

  /** Исполнение через OpenRouter (OpenAI-совместимый HTTP). «Мозг», не файловый исполнитель. */
  _runOpenRouter(agent, prompt, { onData, timeoutMs = 15 * 60 * 1000, model } = {}) {
    const https = require('https');
    const key = this._resolveOpenRouterKey();
    const mdl = model || agent.model || 'deepseek/deepseek-chat';
    if (!key) return Promise.resolve({ ok: false, output: 'OpenRouter: ключ не найден (Настройки → OpenRouter, либо env OPENROUTER_API_KEY / конфиг Hermes)', code: -1 });
    return new Promise(resolve => {
      const data = Buffer.from(JSON.stringify({
        model: mdl,
        messages: [{ role: 'user', content: String(prompt || '') }]
      }), 'utf8');
      const req = https.request({
        host: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Content-Length': data.length,
          'Authorization': 'Bearer ' + key,
          'HTTP-Referer': 'https://github.com/Ursegorus/AURA-OS', 'X-Title': 'AURA OS'
        }
      }, res => {
        let buf = '';
        res.on('data', c => { buf += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(buf);
            if (j.error) return resolve({ ok: false, output: 'OpenRouter: ' + (j.error.message || JSON.stringify(j.error)), code: -1 });
            const text = (((j.choices || [])[0] || {}).message || {}).content || '';
            if (onData && text) onData(text);
            resolve({ ok: true, output: text, code: 0 });
          } catch (e) { resolve({ ok: false, output: 'OpenRouter bad response: ' + buf.slice(0, 300), code: -1 }); }
        });
      });
      req.on('error', e => resolve({ ok: false, output: 'OpenRouter error: ' + e.message, code: -1 }));
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
      req.write(data); req.end();
    });
  }

  /**
   * Run a prompt on an agent. Streams output via onData(chunk).
   * Returns a promise resolving to { ok, output, code }.
   */
  run(agentId, prompt, { cwd, onData, timeoutMs = 15 * 60 * 1000, runId, model, addDirs } = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) return Promise.resolve({ ok: false, output: 'Unknown agent: ' + agentId, code: -1 });

    // API-провайдер (OpenRouter): HTTP, а не spawn CLI.
    if (agent.api === 'openrouter') {
      return this._runOpenRouter(agent, prompt, { onData, timeoutMs, model });
    }

    // Многострочный промпт нельзя передать аргументом через cmd.exe на Windows:
    // перенос строки обрывает команду, и агент видит только первую строку.
    // Поэтому у агентов, читающих промпт из stdin (stdinPrompt:true), на Windows
    // при многострочном промпте шлём его через stdin, а из args убираем {prompt}.
    // Только для stdin-агентов: у других {prompt} может быть значением флага
    // (напр. hermes `-z {prompt}`, kimi `--prompt {prompt}`) — убирать нельзя.
    const useStdin = !!agent.stdinPrompt && (IS_WIN ? /[\r\n]/.test(String(prompt || '')) : false);

    let args = agent.args.map(a => {
      let s = a;
      if (useStdin) {
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

    // Grant the agent access to extra directories (outside cwd) if it supports it.
    if (agent.addDirFlag && Array.isArray(addDirs) && addDirs.length) {
      args = [agent.addDirFlag, ...addDirs, ...args];
    }

    return new Promise(resolve => {
      let output = '';
      let settled = false;
      const env = { ...process.env, NO_COLOR: '1', TERM: 'dumb' };
      const spawnCwd = cwd || os.homedir();
      // На Windows почти все агенты — это .cmd-шимы (npm global), которые нельзя
      // запустить через spawn без оболочки (ENOENT). Поэтому на Windows всегда
      // идём через cmd.exe с экранированием аргументов (как это делают движки).
      let child;
      if (IS_WIN) {
        const escaped = args.map(a => {
          const s = String(a);
          return /[ "'^&|<>()%!]/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
        });
        child = spawn('cmd.exe', ['/c', agent.command, ...escaped], { cwd: spawnCwd, windowsHide: true, env });
      } else {
        child = spawn(agent.command, args, {
          cwd: spawnCwd,
          shell: agent.needsShell === undefined ? false : agent.needsShell,
          windowsHide: true,
          env
        });
      }
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
      // Передаём промпт через stdin если так решено (многострочный / агент так настроен)
      if (useStdin && prompt) {
        try { child.stdin.write(prompt); } catch (_) {}
      }
      try { child.stdin.end(); } catch (_) {}

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
