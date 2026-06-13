/**
 * AURA OS — Telegram remote terminal.
 *
 * A zero-dependency Telegram bot (long polling over the built-in https module)
 * that turns Telegram into a remote terminal for the machine running AURA OS.
 * It stays online for the entire lifetime of the app.
 *
 * Security model:
 *   - The bot ONLY answers chat IDs that are present in the allowlist
 *     (Settings → Telegram). An empty allowlist means nobody is authorised:
 *     the bot still runs, but every message is rejected (and the sender is
 *     told their own chat ID so the owner can add it).
 *   - Each shell command runs with the privileges of the AURA OS process.
 *
 * Capabilities:
 *   - Plain text  -> executed as a shell command (PowerShell on Windows, bash
 *     on Linux/macOS). The working directory persists between messages.
 *   - /cd <path>  -> change the persistent working directory.
 *   - /pwd        -> print the working directory.
 *   - /kill       -> terminate the command currently running for this chat.
 *   - /aura <task>-> launch an AURA orchestrator task; the result is sent back.
 *   - /agents     -> list agents and their availability.
 *   - /id /help /start -> diagnostics and help.
 */
const https = require('https');
const { spawn } = require('child_process');
const os = require('os');

const IS_WIN = process.platform === 'win32';
const API_HOST = 'api.telegram.org';
const TG_LIMIT = 4000;            // Telegram hard limit is 4096; keep headroom
const CMD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT = 200 * 1024;    // cap captured output per command
const CWD_MARKER = '<<<AURA_CWD>>>';

class TelegramTerminal {
  /**
   * @param {object}   deps
   * @param {object}   deps.store        settings store (.get/.set)
   * @param {object}   deps.orchestrator AURA orchestrator
   * @param {object}   deps.agents       AgentManager
   * @param {(s:object)=>void} [deps.onStatus] status sink for the UI
   * @param {(s:string)=>void} [deps.onLog]    log sink for the system console
   */
  constructor({ store, orchestrator, agents, onStatus, onLog }) {
    this.store = store;
    this.orchestrator = orchestrator;
    this.agents = agents;
    this.onStatus = onStatus || (() => {});
    this.onLog = onLog || (() => {});

    this.token = '';
    this.username = '';
    this.allowed = new Set();
    this.cwd = process.env.AURA_TERMINAL_HOME || os.homedir();

    this.running = false;
    this.offset = 0;
    this._abort = null;             // current getUpdates AbortController
    this.children = new Map();      // chatId -> running child process
    this.taskChats = new Map();     // orchestrator taskId -> chatId
  }

  log(msg) { this.onLog('[Telegram] ' + msg + '\n'); }

  status(extra = {}) {
    this.onStatus({
      running: this.running,
      username: this.username,
      allowed: Array.from(this.allowed),
      ...extra
    });
  }

  // ---------- lifecycle ----------

  config() {
    return {
      enabled: this.store.get('telegramEnabled', false),
      token: (this.store.get('telegramToken', '') || '').trim(),
      allowed: (this.store.get('telegramAllowed', '') || '')
        .split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    };
  }

  /** (Re)start the bot from current settings. Safe to call repeatedly. */
  async restart() {
    await this.stop();
    const cfg = this.config();
    if (!cfg.enabled) { this.status({ state: 'disabled' }); return; }
    if (!cfg.token) { this.status({ state: 'error', error: 'No bot token' }); return; }

    this.token = cfg.token;
    this.allowed = new Set(cfg.allowed.map(String));

    let me;
    try {
      me = await this.api('getMe', {});
    } catch (e) {
      this.status({ state: 'error', error: 'getMe failed: ' + e.message });
      this.log('Failed to authorise bot: ' + e.message);
      return;
    }
    if (!me || !me.ok) {
      this.status({ state: 'error', error: 'Invalid bot token' });
      this.log('Invalid bot token.');
      return;
    }
    this.username = me.result.username;
    this.running = true;
    this.status({ state: 'online' });
    this.log('Online as @' + this.username + '. Authorised chats: ' +
      (this.allowed.size ? Array.from(this.allowed).join(', ') : '(none yet)'));

    // Drop any backlog so we don't replay old commands after a restart.
    try {
      const init = await this.api('getUpdates', { offset: -1, timeout: 0 });
      if (init && init.ok && init.result.length) {
        this.offset = init.result[init.result.length - 1].update_id + 1;
      }
    } catch (_) {}

    for (const chat of this.allowed) {
      this.send(chat, '🟢 AURA OS terminal online (' + os.hostname() + ', ' +
        process.platform + '). Send a command or /help.').catch(() => {});
    }

    this.poll();
  }

  async stop() {
    this.running = false;
    if (this._abort) { try { this._abort.abort(); } catch (_) {} this._abort = null; }
    for (const [, child] of this.children) { try { child.kill(); } catch (_) {} }
    this.children.clear();
    this.status({ state: 'disabled' });
  }

  // ---------- polling ----------

  async poll() {
    while (this.running) {
      try {
        const res = await this.api('getUpdates', { offset: this.offset, timeout: 50 }, 60000);
        if (!this.running) break;
        if (res && res.ok) {
          for (const upd of res.result) {
            this.offset = upd.update_id + 1;
            this.handleUpdate(upd).catch(e => this.log('handler error: ' + e.message));
          }
        }
      } catch (e) {
        if (!this.running) break;
        this.log('poll error: ' + e.message + ' — retrying in 3s');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async handleUpdate(upd) {
    const msg = upd.message || upd.edited_message;
    if (!msg || !msg.chat) return;
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    if (!text) return;

    if (!this.allowed.has(chatId)) {
      await this.send(chatId,
        '⛔ Not authorised.\nYour chat ID: `' + chatId + '`\n' +
        'Add it to AURA OS → Settings → Telegram to enable this terminal.');
      this.log('Rejected message from unauthorised chat ' + chatId);
      return;
    }

    if (text.startsWith('/')) return this.handleCommand(chatId, text);
    return this.runShell(chatId, text);
  }

  // ---------- commands ----------

  async handleCommand(chatId, text) {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = text.slice(cmd.length).trim();
    switch (cmd.toLowerCase()) {
      case '/start':
      case '/help':
        return this.send(chatId,
          '🤖 *AURA OS remote terminal*\n\n' +
          'Send any text to run it as a shell command (' +
          (IS_WIN ? 'PowerShell' : 'bash') + ').\n\n' +
          '*Commands*\n' +
          '/pwd — current directory\n' +
          '/cd <path> — change directory\n' +
          '/kill — stop the running command\n' +
          '/aura <task> — run an AURA agent task\n' +
          '/agents — list agents\n' +
          '/id — show this chat ID\n' +
          'Working dir: `' + this.cwd + '`');
      case '/id':
        return this.send(chatId, 'Chat ID: `' + chatId + '`');
      case '/pwd':
        return this.send(chatId, '`' + this.cwd + '`');
      case '/cd':
        return this.changeDir(chatId, arg);
      case '/kill':
      case '/stop': {
        const child = this.children.get(chatId);
        if (child) { try { child.kill(); } catch (_) {} return this.send(chatId, '🛑 Killed.'); }
        return this.send(chatId, 'Nothing is running.');
      }
      case '/agents':
        return this.listAgents(chatId);
      case '/aura':
        if (!arg) return this.send(chatId, 'Usage: /aura <task description>');
        return this.startAura(chatId, arg);
      default:
        return this.send(chatId, 'Unknown command. /help for the list.');
    }
  }

  async changeDir(chatId, arg) {
    const fs = require('fs');
    const path = require('path');
    if (!arg) { return this.send(chatId, '`' + this.cwd + '`'); }
    const target = path.resolve(this.cwd, arg.replace(/^["']|["']$/g, ''));
    try {
      if (fs.statSync(target).isDirectory()) {
        this.cwd = target;
        return this.send(chatId, '📁 `' + this.cwd + '`');
      }
      return this.send(chatId, 'Not a directory: ' + target);
    } catch (_) {
      return this.send(chatId, 'No such directory: ' + target);
    }
  }

  async listAgents(chatId) {
    try {
      const availability = await this.agents.detectAll();
      const enabled = this.store.get('enabledAgents', {});
      const lines = this.agents.getAgents().map(a => {
        const ok = availability[a.id] && availability[a.id].available;
        const on = enabled[a.id] !== false;
        return (ok ? '✅' : '⬜') + ' ' + a.name + (on ? '' : ' (off)');
      });
      return this.send(chatId, '*Agents*\n' + lines.join('\n'));
    } catch (e) {
      return this.send(chatId, 'Failed to list agents: ' + e.message);
    }
  }

  async startAura(chatId, task) {
    if (!this.orchestrator) return this.send(chatId, 'Orchestrator unavailable.');
    try {
      const taskId = await this.orchestrator.startTask(task);
      this.taskChats.set(taskId, chatId);
      return this.send(chatId, '🧠 AURA task started: `' + taskId + '`\nI will report the result here.');
    } catch (e) {
      return this.send(chatId, 'Failed to start task: ' + e.message);
    }
  }

  /** Called by main when the orchestrator emits an event. */
  onAuraEvent(event) {
    if (!event || event.type !== 'task-updated' || !event.task) return;
    const t = event.task;
    const chatId = this.taskChats.get(t.id);
    if (!chatId) return;
    if (['completed', 'completed-with-errors', 'failed', 'cancelled'].includes(t.status)) {
      this.taskChats.delete(t.id);
      const head = '🧠 AURA task *' + t.status + '*\n' + (t.title || '') + '\n\n';
      this.send(chatId, head + (t.summary || '(no summary)')).catch(() => {});
    }
  }

  // ---------- shell execution ----------

  runShell(chatId, command) {
    if (this.children.has(chatId)) {
      return this.send(chatId, '⏳ A command is still running. Use /kill to stop it.');
    }
    let shellCmd, shellArgs;
    if (IS_WIN) {
      const wrapped = command + '\n; Write-Output ("' + CWD_MARKER + '" + (Get-Location).Path)';
      shellCmd = 'powershell.exe';
      shellArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', wrapped];
    } else {
      const wrapped = command + '\nprintf "\\n%s%s" "' + CWD_MARKER + '" "$PWD"';
      shellCmd = 'bash';
      shellArgs = ['-lc', wrapped];
    }

    const child = spawn(shellCmd, shellArgs, {
      cwd: this.cwd,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' }
    });
    this.children.set(chatId, child);

    let out = '';
    let truncated = false;
    const onData = (d) => {
      if (truncated) return;
      out += d.toString();
      if (out.length > MAX_OUTPUT) { out = out.slice(0, MAX_OUTPUT); truncated = true; }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.stdin.end();

    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, CMD_TIMEOUT_MS);

    const finish = (code) => {
      clearTimeout(timer);
      this.children.delete(chatId);

      // Pull the trailing CWD marker out of the output and update cwd.
      const idx = out.lastIndexOf(CWD_MARKER);
      if (idx >= 0) {
        const newCwd = out.slice(idx + CWD_MARKER.length).trim();
        if (newCwd) this.cwd = newCwd;
        out = out.slice(0, idx);
      }
      out = out.replace(/\s+$/, '');
      if (truncated) out += '\n…[output truncated]';

      const header = (code === 0 ? '✅' : '⚠️ exit ' + code);
      const body = out.length ? out : '(no output)';
      this.sendChunked(chatId, header, body);
    };
    child.on('error', (err) => finish('spawn error: ' + err.message));
    child.on('close', finish);
  }

  /** Send possibly-long terminal output as one or more code-block messages. */
  async sendChunked(chatId, header, body) {
    const fence = '```';
    const room = TG_LIMIT - header.length - fence.length * 2 - 8;
    const parts = [];
    for (let i = 0; i < body.length; i += room) parts.push(body.slice(i, i + room));
    for (let i = 0; i < parts.length; i++) {
      const h = parts.length > 1 ? header + ' [' + (i + 1) + '/' + parts.length + ']' : header;
      await this.send(chatId, h + '\n' + fence + '\n' + parts[i] + '\n' + fence, false)
        .catch(() => this.send(chatId, h + '\n' + parts[i], true).catch(() => {}));
    }
  }

  // ---------- Telegram API ----------

  send(chatId, text, plain) {
    return this.api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: plain ? undefined : 'Markdown',
      disable_web_page_preview: true
    }).catch(e => this.log('send failed: ' + e.message));
  }

  /** Low-level Bot API call. Resolves with parsed JSON, rejects on transport error. */
  api(method, params, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(params), 'utf8');
      const ac = (method === 'getUpdates') ? new (require('events').EventEmitter)() : null;
      const req = https.request({
        host: API_HOST,
        path: '/bot' + this.token + '/' + method,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
      }, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('bad JSON: ' + body.slice(0, 200))); }
        });
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
      if (method === 'getUpdates') this._abort = { abort: () => req.destroy(new Error('aborted')) };
      req.write(data);
      req.end();
    });
  }
}

module.exports = { TelegramTerminal };
