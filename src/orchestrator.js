/**
 * AURA OS — Orchestrator.
 *
 * Два режима:
 *   1. Hermes engine (новый) — вся оркестрация через `hermes chat -q`.
 *      Hermes сам планирует, распределяет по CLI-агентам, ревьюит,
 *      фиксит и возвращает результат. AURA OS — GUI + Obsidian + Telegram.
 *
 *   2. Классический (старый) — AURA сама запускает CLI-агенты через
 *      child_process (PLAN→EXECUTE→REVIEW). Оставлен для обратной
 *      совместимости и работы без установленного Hermes.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let seq = 0;
const nextId = (p) => p + '-' + (++seq) + '-' + Date.now().toString(36);
const IS_WIN = process.platform === 'win32';

// ============================================================
//  КЛАССИЧЕСКИЙ ОРКЕСТРАТОР (legacy, когда Hermes не установлен)
// ============================================================

class LegacyOrchestrator {
  constructor(agents, memory, store, emit) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this.tasks = new Map();
  }

  settings() {
    return {
      maxParallel: this.store.get('maxParallel', 3),
      maxFixRounds: this.store.get('maxFixRounds', 2),
      workspace: this.store.get('workspace', ''),
      reviewEnabled: this.store.get('reviewEnabled', true),
      trustedDirs: this.store.get('trustedDirs', [])
    };
  }

  workspaceDir() {
    let ws = this.settings().workspace;
    if (!ws) {
      ws = path.join(require('os').homedir(), 'AURA-Workspace');
    }
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
    return ws;
  }

  planningPrompt(input, available) {
    const agentList = available.map(a =>
      `- id: "${a.id}" | имя: ${a.name} | навыки: ${a.skills.join(', ')} | роли: ${a.roles.join(', ')}`
    ).join('\n');
    const memoryCtx = this.memory.recentContext();
    return [
      'Ты — координатор мультиагентной системы AURA OS. Разбей задачу пользователя на подзадачи и распредели их между доступными агентами по их навыкам.',
      '',
      'Доступные агенты:',
      agentList,
      '',
      memoryCtx ? 'Недавняя память системы (для контекста):\n' + memoryCtx + '\n' : '',
      'Задача пользователя:',
      '"""' + input + '"""',
      '',
      'Ответь ТОЛЬКО валидным JSON-массивом без пояснений и без markdown. Формат каждого элемента:',
      '{"id":"t1","title":"короткое название","agent":"<id агента>","role":"coder|reviewer|researcher|writer","complexity":"trivial|standard|complex","prompt":"полная самодостаточная инструкция для агента","dependsOn":["t0"]}',
      '',
      'Поле complexity (для экономной маршрутизации моделей): "trivial" — форматирование, конвертация, простые правки; "standard" — обычный код, ресёрч, тексты, ревью; "complex" — архитектура, сложный кодинг, отладка, многошаговое рассуждение.',
      '',
      'Назначай агентов СТРОГО по их реальным навыкам, а не по порядку в списке. Если подзадача требует поиска в интернете, актуальных данных, анализа сайтов или сбора источников — назначай её агенту, у которого в навыках есть "web-search" (если таких несколько — выбери наиболее подходящего по остальным навыкам). Не поручай веб-поиск агенту без "web-search".',
      '',
      'Правила: 1-6 подзадач; prompt пишется так, будто агент не видит других подзадач; независимые подзадачи не указывают dependsOn (они выполнятся параллельно); если задача связана с кодом — последней подзадачей сделай ревью кода агентом с ролью reviewer, отличным от исполнителя; все файлы создаются в текущей рабочей директории.'
    ].join('\n');
  }

  parsePlan(text, available) {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    let arr;
    try { arr = JSON.parse(match[0]); } catch (e) { return null; }
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ids = new Set(available.map(a => a.id));
    const tiers = new Set(['trivial', 'standard', 'complex']);
    return arr.map((st, i) => ({
      id: st.id || 't' + (i + 1),
      title: st.title || 'Подзадача ' + (i + 1),
      agent: ids.has(st.agent) ? st.agent : available[0].id,
      role: st.role || 'coder',
      complexity: tiers.has(st.complexity) ? st.complexity : 'standard',
      prompt: st.prompt || '',
      dependsOn: Array.isArray(st.dependsOn) ? st.dependsOn : [],
      status: 'pending',
      output: ''
    })).filter(st => st.prompt);
  }

  fallbackPlan(input, available) {
    const coder = available.find(a => a.roles.includes('coder')) || available[0];
    const reviewer = available.find(a => a.roles.includes('reviewer') && a.id !== coder.id);
    const plan = [{
      id: 't1', title: 'Выполнение задачи', agent: coder.id, role: 'coder',
      complexity: 'complex', prompt: input, dependsOn: [], status: 'pending', output: ''
    }];
    if (reviewer && this.settings().reviewEnabled) {
      plan.push({
        id: 't2', title: 'Проверка результата', agent: reviewer.id, role: 'reviewer',
        complexity: 'standard',
        prompt: 'Проверь результат работы в текущей директории по задаче: "' + input +
          '". Найди ошибки и недочёты. Если всё корректно, ответь строкой APPROVED. Иначе перечисли проблемы.',
        dependsOn: ['t1'], status: 'pending', output: ''
      });
    }
    return plan;
  }

  async startTask(input) {
    const availability = await this.agents.detectAll();
    const available = this.agents.getAgents().filter(a =>
      availability[a.id] && availability[a.id].available && this.store.get('enabledAgents', {})[a.id] !== false
    );
    const taskId = nextId('task');
    const task = {
      id: taskId, input, title: input.slice(0, 60), status: 'planning',
      subtasks: [], startedAt: Date.now(), summary: ''
    };
    this.tasks.set(taskId, task);
    this.emit({ type: 'task-created', task: this.publicTask(task) });

    if (available.length === 0) {
      task.status = 'failed';
      task.summary = 'Не найден ни один установленный агент. Установите CLI хотя бы одного агента (claude, codex, gemini, ollama) и обновите список.';
      this.emit({ type: 'task-updated', task: this.publicTask(task) });
      return taskId;
    }

    this.runPipeline(task, available).catch(err => {
      task.status = 'failed';
      task.summary = 'Ошибка оркестратора: ' + err.message;
      this.emit({ type: 'task-updated', task: this.publicTask(task) });
    });
    return taskId;
  }

  async runPipeline(task, available) {
    const s = this.settings();
    const cwd = this.workspaceDir();

    // 1) PLAN
    let plan = null;
    const lead = available[0];
    this.emit({ type: 'log', taskId: task.id, agent: lead.id, text: '[AURA] Планирование через ' + lead.name + '…\n' });

    if (available.length > 1) {
      const res = await this.agents.run(lead.id, this.planningPrompt(task.input, available), {
        cwd, runId: task.id + ':plan', addDirs: s.trustedDirs,
        onData: t => this.emit({ type: 'log', taskId: task.id, agent: lead.id, text: t })
      });
      if (res.ok) plan = this.parsePlan(res.output, available);
    }
    if (!plan) {
      this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] План не получен — использую базовый сценарий (исполнитель + ревьюер).\n' });
      plan = this.fallbackPlan(task.input, available);
    }
    task.subtasks = plan.map(st => ({ ...st, agentName: (this.agents.getAgent(st.agent) || {}).name }));
    task.status = 'running';
    this.emit({ type: 'task-updated', task: this.publicTask(task) });

    // 2) EXECUTE
    await this.executePlan(task, cwd, s.maxParallel);
    // 3) REVIEW / FIX
    if (s.reviewEnabled) await this.reviewLoop(task, cwd, s.maxFixRounds);
    // 4) FINISH + MEMORY
    await this.finishTask(task);
  }

  async executePlan(task, cwd, maxParallel) {
    const done = new Set();
    const inFlight = new Map();

    const ready = () => task.subtasks.filter(st =>
      st.status === 'pending' &&
      !inFlight.has(st.id) &&
      st.dependsOn.every(d => done.has(d))
    );

    while (done.size + task.subtasks.filter(s => s.status === 'failed').length < task.subtasks.length) {
      const pending = task.subtasks.filter(st => st.status === 'pending' && !inFlight.has(st.id));
      const startable = ready();
      if (startable.length === 0 && inFlight.size === 0) {
        for (const st of pending) { st.status = 'skipped'; }
        break;
      }
      for (const st of startable.slice(0, Math.max(1, maxParallel - inFlight.size))) {
        st.status = 'running';
        this.emit({ type: 'task-updated', task: this.publicTask(task) });
        const depContext = st.dependsOn
          .map(d => task.subtasks.find(x => x.id === d))
          .filter(Boolean)
          .map(d => `Результат шага «${d.title}» (${d.agentName}):\n${(d.output || '').slice(-3000)}`)
          .join('\n\n');
        const prompt = depContext ? depContext + '\n\n---\n\n' + st.prompt : st.prompt;
        const p = this.agents.run(st.agent, prompt, {
          cwd, runId: task.id + ':' + st.id,
          onData: t => this.emit({ type: 'log', taskId: task.id, agent: st.agent, subtask: st.id, text: t })
        }).then(res => {
          st.output = res.output;
          st.status = res.ok ? 'done' : 'failed';
          if (res.ok) done.add(st.id);
          inFlight.delete(st.id);
          this.emit({ type: 'task-updated', task: this.publicTask(task) });
        });
        inFlight.set(st.id, p);
      }
      if (inFlight.size > 0) await Promise.race(inFlight.values());
    }
  }

  async reviewLoop(task, cwd, maxFixRounds) {
    const reviews = task.subtasks.filter(st => st.role === 'reviewer' && st.status === 'done');
    for (const review of reviews) {
      let verdict = review.output || '';
      let round = 0;
      while (round < maxFixRounds && verdict && !/APPROVED/i.test(verdict.slice(-500))) {
        round++;
        const targetId = review.dependsOn[0];
        const target = task.subtasks.find(x => x.id === targetId) || task.subtasks[0];
        const fixer = target ? target.agent : review.agent;
        const fixerAgent = this.agents.getAgent(fixer);
        this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: `\n[AURA] Ревью нашло проблемы — раунд исправления ${round}/${maxFixRounds} (${fixerAgent ? fixerAgent.name : fixer})…\n` });

        const fixComplexity = target ? (target.complexity || 'complex') : 'complex';
        const fixSt = {
          id: review.id + '-fix' + round, title: 'Исправление (раунд ' + round + ')',
          agent: fixer, agentName: fixerAgent ? fixerAgent.name : fixer, role: 'coder',
          complexity: fixComplexity, prompt: '', dependsOn: [], status: 'running', output: ''
        };
        task.subtasks.push(fixSt);
        this.emit({ type: 'task-updated', task: this.publicTask(task) });

        const fixRes = await this.agents.run(fixer,
          `Ревьюер нашёл проблемы в работе по задаче: "${task.input}".\n\nЗамечания ревьюера:\n${verdict.slice(-4000)}\n\nИсправь все перечисленные проблемы в файлах текущей директории. После исправления кратко перечисли, что изменил.`,
          { cwd, runId: task.id + ':' + fixSt.id });
        fixSt.output = fixRes.output;
        fixSt.status = fixRes.ok ? 'done' : 'failed';
        this.emit({ type: 'task-updated', task: this.publicTask(task) });
        if (!fixRes.ok) break;

        const reRes = await this.agents.run(review.agent,
          `Повторно проверь работу в текущей директории по задаче: "${task.input}". Если всё корректно — ответь строкой APPROVED. Иначе перечисли оставшиеся проблемы.`,
          { cwd, runId: task.id + ':' + review.id + '-re' + round });
        verdict = reRes.ok ? reRes.output : '';
        review.output += '\n\n--- Повторное ревью (раунд ' + round + ') ---\n' + reRes.output;
      }
    }
  }

  async finishTask(task) {
    const failed = task.subtasks.some(st => st.status === 'failed');
    task.status = failed ? 'completed-with-errors' : 'completed';
    task.summary = this.buildSummary(task);
    try {
      const note = this.memory.saveTaskNote(task);
      if (note) this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Результат сохранён в память Obsidian: ' + note + '\n' });
    } catch (e) {
      this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Не удалось записать в Obsidian: ' + e.message + '\n' });
    }
    this.emit({ type: 'task-updated', task: this.publicTask(task) });
  }

  buildSummary(task) {
    const ok = task.subtasks.filter(s => s.status === 'done').length;
    const failed = task.subtasks.filter(s => s.status === 'failed').length;
    const last = task.subtasks[task.subtasks.length - 1];
    return `Подзадач выполнено: ${ok}, с ошибками: ${failed}. Рабочая папка: ${this.workspaceDir()}.` +
      (last && last.output ? `\n\nПоследний результат:\n${last.output.slice(-1500)}` : '');
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    for (const st of task.subtasks) this.agents.cancel(taskId + ':' + st.id);
    this.agents.cancel(taskId + ':plan');
    task.status = 'cancelled';
    this.emit({ type: 'task-updated', task: this.publicTask(task) });
    return true;
  }

  publicTask(task) {
    return {
      id: task.id, input: task.input, title: task.title, status: task.status,
      startedAt: task.startedAt, summary: task.summary,
      subtasks: task.subtasks.map(st => ({
        id: st.id, title: st.title, agent: st.agent, agentName: st.agentName,
        role: st.role, status: st.status, dependsOn: st.dependsOn,
        complexity: st.complexity, model: st.model,
        output: (st.output || '').slice(-4000)
      }))
    };
  }

  listTasks() {
    return Array.from(this.tasks.values()).map(t => this.publicTask(t)).reverse();
  }
}

// ============================================================
//  HERMES ENGINE — ВСЯ ОРКЕСТРАЦИЯ ЧЕРЕЗ HERMES CLI
// ============================================================

class HermesEngine {
  constructor(agents, memory, store, emit) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this.tasks = new Map();
    this._running = new Map(); // taskId -> child process
  }

  settings() {
    return {
      workspace: this.store.get('workspace', ''),
      coordinator: this.store.get('coordinator', 'claude-code'),
      maxParallel: this.store.get('maxParallel', 3)
    };
  }

  workspaceDir() {
    let ws = this.settings().workspace;
    if (!ws) {
      ws = path.join(require('os').homedir(), 'AURA-Workspace');
    }
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
    return ws;
  }

  async startTask(input) {
    const taskId = nextId('hermes-task');
    const cwd = this.workspaceDir();
    const task = {
      id: taskId, input, title: input.slice(0, 60), status: 'running',
      subtasks: [], startedAt: Date.now(), summary: '',
      output: '', engine: 'hermes'
    };
    this.tasks.set(taskId, task);
    this.emit({ type: 'task-created', task: this.publicTask(task) });
    this.emit({ type: 'log', taskId, agent: 'hermes', text: `[AURA] Запуск через Hermes engine…\n` });

    // Контекст из базы знаний
    const vaultCtx = this.memory.searchContext(input, 5);

    // Собираем промпт для Hermes
    // Навык aura-os-orchestrator уже загружен в профиле, так что
    // Hermes сам знает, как оркестрировать CLI-агенты.
    const prompt = [
      `Задача от AURA OS: ${input}`,
      vaultCtx ? `\nКонтекст из базы знаний:${vaultCtx}` : '',
      `Рабочая директория (ВСЕ файлы создавай ТОЛЬКО здесь): ${cwd}`,
      '',
      'Координатор: hermes',
      `Макс. параллельных: ${this.settings().maxParallel}`,
      '',
      'ВАЖНО: Все файлы, папки, артефакты — строго внутри рабочей директории. Не создавай ничего вне её.',
      'Используй навыки claude-code, codex, opencode для запуска агентов.',
      'Пиши на русском.',
      'В конце ответа добавь строку: [AURA_DONE]',
      'После этой строки напиши краткий JSON-отчёт:',
      '{"status":"completed|failed","summary":"краткий итог","files_changed":["файл1","файл2"]}'
    ].join('\n');

    const hermesPath = 'hermes';
    const args = [
      '-p', 'aura-os',
      'chat', '-q', prompt,
      '--skills', 'aura-os-orchestrator,claude-code,codex,opencode',
      '--yolo', '-Q'
    ];

    // Экранируем аргументы для shell (требуется на Windows для .cmd файлов)
    const escaped = args.map(a => {
      const s = String(a);
      return /[ "']/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
    });

    const child = IS_WIN
      ? spawn('cmd.exe', ['/c', hermesPath, ...escaped], {
          cwd, windowsHide: true,
          env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' }
        })
      : spawn(hermesPath, args, {
          cwd, windowsHide: true,
          env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' }
        });

    this._running.set(taskId, child);

    let output = '';
    const handleData = (data) => {
      const text = data.toString();
      output += text;
      task.output = output;
      this.emit({ type: 'log', taskId, agent: 'hermes', text });
    };
    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    return new Promise((resolve) => {
      child.on('error', (err) => {
        task.status = 'failed';
        task.summary = 'Hermes engine error: ' + err.message;
        this.emit({ type: 'log', taskId, agent: 'hermes', text: `\n[AURA] Ошибка: ${err.message}\n` });
        this.finishTask(task);
        resolve(taskId);
      });
      child.on('close', (code) => {
        this._running.delete(taskId);
        // Парсим JSON-отчёт из конца вывода
        const doneIdx = output.lastIndexOf('[AURA_DONE]');
        if (doneIdx >= 0) {
          const jsonPart = output.slice(doneIdx + 11).trim();
          try {
            const report = JSON.parse(jsonPart);
            task.status = report.status === 'completed' ? 'completed' : 'completed-with-errors';
            task.summary = report.summary || task.summary;
          } catch (_) {
            // JSON не распарсился — используем plain text
            task.status = code === 0 ? 'completed' : 'failed';
          }
        } else {
          task.status = code === 0 ? 'completed' : 'failed';
        }
        if (!task.summary) {
          task.summary = output.slice(-500).trim();
        }
        this.finishTask(task);
        resolve(taskId);
      });
    });
  }

  finishTask(task) {
    // Сохраняем в Obsidian (как и раньше)
    let notePath = null;
    try {
      const note = this.memory.saveTaskNote({
        id: task.id,
        input: task.input,
        title: task.title,
        status: task.status,
        summary: task.summary,
        subtasks: [{ title: 'Hermes оркестрация', agent: 'Hermes Agent', agentName: 'Hermes Agent', role: 'coordinator', output: task.output }]
      });
      if (note) {
        notePath = note;
        this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Результат сохранён в память Obsidian: ' + note + '\n' });
      }
    } catch (e) {
      this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Не удалось записать в Obsidian: ' + e.message + '\n' });
    }

    // Синхронизируем с Hermes memory (fire-and-forget)
    if (task.summary) {
      this._syncToHermesMemory(task, notePath).catch(() => {});
    }

    this.emit({ type: 'task-updated', task: this.publicTask(task) });
  }

  /** Отправить результат задачи в Hermes memory. */
  async _syncToHermesMemory(task, notePath) {
    const { spawn } = require('child_process');
    const prompt = [
      'AURA OS: задача завершена.',
      `Задача: ${task.input}`,
      `Статус: ${task.status}`,
      `Итог: ${(task.summary || '').slice(0, 2000)}`,
      notePath ? `Заметка Obsidian: ${notePath}` : ''
    ].filter(Boolean).join('\n');

    const fullArgs = ['-p', 'aura-os', 'chat', '-q',
      `Сохрани в память: ${prompt}`,
      '--yolo', '-Q'
    ];
    const child = IS_WIN
      ? spawn('cmd.exe', ['/c', 'hermes', ...fullArgs], { windowsHide: true })
      : spawn('hermes', fullArgs, { windowsHide: true });

    // Не ждём — fire-and-forget
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('close', () => {
      this.emit({ type: 'log', taskId: task.id, agent: 'hermes', text: '\n[AURA] Память синхронизирована с Hermes.\n' });
    });
  }

  cancelTask(taskId) {
    const child = this._running.get(taskId);
    if (child) { try { child.kill(); } catch (_) {} this._running.delete(taskId); }
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      this.emit({ type: 'task-updated', task: this.publicTask(task) });
      return true;
    }
    return false;
  }

  publicTask(task) {
    return {
      id: task.id, input: task.input, title: task.title, status: task.status,
      startedAt: task.startedAt, summary: task.summary, engine: task.engine,
      subtasks: task.subtasks
    };
  }

  listTasks() {
    return Array.from(this.tasks.values()).reverse();
  }
}


// ============================================================
//  OPENCODE ENGINE — ОРКЕСТРАЦИЯ ЧЕРЕЗ OPENCODE CLI
//  Не требует API-ключей — использует встроенные бесплатные модели
// ============================================================

class OpenCodeEngine {
  constructor(agents, memory, store, emit) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this.tasks = new Map();
    this._running = new Map();
  }

  settings() {
    return {
      workspace: this.store.get('workspace', ''),
      maxParallel: this.store.get('maxParallel', 3)
    };
  }

  workspaceDir() {
    let ws = this.settings().workspace;
    if (!ws) {
      ws = path.join(require('os').homedir(), 'AURA-Workspace');
    }
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
    return ws;
  }

  async startTask(input) {
    const taskId = nextId('opencode-task');
    const cwd = this.workspaceDir();
    const task = {
      id: taskId, input, title: input.slice(0, 60), status: 'running',
      subtasks: [], startedAt: Date.now(), summary: '',
      output: '', engine: 'opencode'
    };
    this.tasks.set(taskId, task);
    this.emit({ type: 'task-created', task: this.publicTask(task) });
    this.emit({ type: 'log', taskId, agent: 'opencode', text: `[AURA] Запуск через OpenCode engine (бесплатные модели)\n` });

    // Контекст из базы знаний
    const vaultCtx = this.memory.searchContext(input, 5);

    const prompt = [
      `Задача от AURA OS: ${input}`,
      vaultCtx ? `\nКонтекст из базы знаний:${vaultCtx}` : '',
      `Рабочая директория (ВСЕ файлы создавай ТОЛЬКО здесь): ${cwd}`,
      '',
      'ВАЖНО: Все файлы, папки, артефакты — строго внутри рабочей директории.',
      'Пиши на русском.'
    ].join('\n');

    const args = ['run', prompt];
    const escaped = args.map(a => {
      const s = String(a);
      return /[ "']/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
    });

    const child = IS_WIN
      ? spawn('cmd.exe', ['/c', 'opencode', ...escaped], { cwd, windowsHide: true, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } })
      : spawn('opencode', args, { cwd, windowsHide: true, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } });

    this._running.set(taskId, child);

    let output = '';
    child.stdout.on('data', d => { const t = d.toString(); output += t; task.output = output; this.emit({ type: 'log', taskId, agent: 'opencode', text: t }); });
    child.stderr.on('data', d => { const t = d.toString(); output += t; task.output = output; this.emit({ type: 'log', taskId, agent: 'opencode', text: t }); });

    return new Promise((resolve) => {
      child.on('error', (err) => {
        task.status = 'failed';
        task.summary = 'OpenCode engine error: ' + err.message;
        this.emit({ type: 'log', taskId, agent: 'opencode', text: `\n[AURA] Ошибка: ${err.message}\n` });
        this.finishTask(task);
        resolve(taskId);
      });
      child.on('close', (code) => {
        this._running.delete(taskId);
        task.status = code === 0 ? 'completed' : 'failed';
        task.summary = output.slice(-500).trim();
        this.finishTask(task);
        resolve(taskId);
      });
    });
  }

  finishTask(task) {
    let notePath = null;
    try {
      const note = this.memory.saveTaskNote({
        id: task.id, input: task.input, title: task.title,
        status: task.status, summary: task.summary,
        subtasks: [{ title: 'OpenCode выполнение', agent: 'OpenCode', agentName: 'OpenCode', role: 'coder', output: task.output }]
      });
      if (note) { notePath = note; this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Результат сохранён в память Obsidian: ' + note + '\n' }); }
    } catch (e) {
      this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Не удалось записать в Obsidian: ' + e.message + '\n' });
    }
    this.emit({ type: 'task-updated', task: this.publicTask(task) });
  }

  cancelTask(taskId) {
    const child = this._running.get(taskId);
    if (child) { try { child.kill(); } catch (_) {} this._running.delete(taskId); }
    const task = this.tasks.get(taskId);
    if (task) { task.status = 'cancelled'; this.emit({ type: 'task-updated', task: this.publicTask(task) }); return true; }
    return false;
  }

  publicTask(task) {
    return { id: task.id, input: task.input, title: task.title, status: task.status, startedAt: task.startedAt, summary: task.summary, engine: task.engine, subtasks: task.subtasks };
  }

  listTasks() {
    return Array.from(this.tasks.values()).reverse();
  }
}

// ФАБРИКА — выбирает движок по настройке orchestratorMode

// ============================================================
//  ФАБРИКА — выбирает движок в зависимости от настроек
// ============================================================

class Orchestrator {
  constructor(agents, memory, store, emit) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this._legacy = new LegacyOrchestrator(agents, memory, store, emit);
    this._hermes = new HermesEngine(agents, memory, store, emit);
    this._opencode = new OpenCodeEngine(agents, memory, store, emit);
  }

  _engine() {
    const mode = this.store.get('orchestratorMode', 'auto');
    if (mode === 'legacy') return this._legacy;
    if (mode === 'hermes') {
      // Проверяем, установлен ли Hermes
      const hermesOk = this.store.get('_hermesAvailable', false);
      if (!hermesOk) {
        const opencodeOk = this.store.get('_opencodeAvailable', false);
        return opencodeOk ? this._opencode : this._legacy;
      }
      return this._hermes;
    }
    if (mode === 'opencode') {
      const opencodeOk = this.store.get('_opencodeAvailable', false);
      return opencodeOk ? this._opencode : this._legacy;
    }
    // auto: hermes > opencode > legacy
    const hermesOk = this.store.get('_hermesAvailable', false);
    if (hermesOk) return this._hermes;
    const opencodeOk = this.store.get('_opencodeAvailable', false);
    return opencodeOk ? this._opencode : this._legacy;
  }

  /** Вызывается при старте — проверяет доступные движки. */
  async detectEngines() {
    const { execFile } = require('child_process');
    const check = (cmd) => new Promise(resolve => {
      const c = require('child_process').spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh',
        [process.platform === 'win32' ? '/c' : '-c', cmd + ' --version 2>&1'], { windowsHide: true });
      let out = '';
      c.stdout.on('data', d => out += d);
      c.stderr.on('data', d => out += d);
      c.on('close', code => resolve(code === 0));
    });
    const hermes = await check('hermes');
    const opencode = await check('opencode');
    this.store.set('_hermesAvailable', hermes);
    this.store.set('_opencodeAvailable', opencode);
    return { hermes, opencode };
  }

  startTask(input) { return this._engine().startTask(input); }
  cancelTask(id) { return this._engine().cancelTask(id); }
  listTasks() { return this._engine().listTasks(); }
  settings() { return this._engine().settings(); }
  workspaceDir() { return this._engine().workspaceDir(); }
}

module.exports = { Orchestrator, LegacyOrchestrator, HermesEngine, OpenCodeEngine };
