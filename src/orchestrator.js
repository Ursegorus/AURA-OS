/**
 * AURA OS — Orchestrator.
 * Pipeline: PLAN (coordinator agent decomposes the task into subtasks)
 *        -> EXECUTE (subtasks run on assigned agents, in parallel when independent)
 *        -> REVIEW/FIX loop (reviewer agent checks results, executor fixes)
 *        -> MEMORY (run is persisted to the Obsidian vault).
 */
const path = require('path');
const fs = require('fs');

let seq = 0;
const nextId = (p) => p + '-' + (++seq) + '-' + Date.now().toString(36);

class Orchestrator {
  /**
   * @param {AgentManager} agents
   * @param {Memory} memory
   * @param {object} store settings store
   * @param {(event: object) => void} emit  renderer event sink
   * @param {object|null} pro  Pro-модуль (опционально)
   */
  constructor(agents, memory, store, emit, pro) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this.pro = pro || null;
    this.tasks = new Map();
  }

  settings() {
    return {
      coordinator: this.store.get('coordinator', 'claude-code'),
      maxParallel: this.store.get('maxParallel', 3),
      maxFixRounds: this.store.get('maxFixRounds', 2),
      workspace: this.store.get('workspace', ''),
      reviewEnabled: this.store.get('reviewEnabled', true)
    };
  }

  /** Route model via Pro-модуль (если установлен). */
  _routeModel(agent, complexity) {
    if (!this.pro || !agent) return undefined;
    const routing = this.store.get('smartRouting', false);
    if (!routing) return undefined;
    return this.pro.routeModel(agent, complexity);
  }

  workspaceDir() {
    let ws = this.settings().workspace;
    if (!ws) {
      ws = path.join(require('os').homedir(), 'AURA-Workspace');
    }
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
    return ws;
  }

  // ---------- PLANNING ----------

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
      'Правила: 1-6 подзадач; prompt пишется так, будто агент не видит других подзадач; независимые подзадачи не указывают dependsOn (они выполнятся параллельно); если задача связана с кодом — последней подзадачей сделай ревью кода агентом с ролью reviewer; все файлы создаются в текущей рабочей директории.'
    ].join('\n');
  }

  parsePlan(text, available) {
    // extract the first JSON array from the model output
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

  // ---------- EXECUTION ----------

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
    const coordinator = available.find(a => a.id === s.coordinator) ||
      available.find(a => a.roles.includes('coordinator')) || available[0];
    this.emit({ type: 'log', taskId: task.id, agent: coordinator.id, text: '[AURA] Планирование через ' + coordinator.name + '…\n' });

    if (available.length > 1 || coordinator) {
      const res = await this.agents.run(coordinator.id, this.planningPrompt(task.input, available), {
        cwd, runId: task.id + ':plan',
        onData: t => this.emit({ type: 'log', taskId: task.id, agent: coordinator.id, text: t })
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

    // 2) EXECUTE with dependency-aware parallelism
    await this.executePlan(task, cwd, s.maxParallel);

    // 3) REVIEW / FIX loop
    if (s.reviewEnabled) await this.reviewLoop(task, cwd, s.maxFixRounds);

    // 4) FINISH + MEMORY
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

  async executePlan(task, cwd, maxParallel) {
    const done = new Set();
    const inFlight = new Map();

    const ready = () => task.subtasks.filter(st =>
      st.status === 'pending' &&
      !inFlight.has(st.id) &&
      st.dependsOn.every(d => done.has(d))
    );

    while (done.size + task.subtasks.filter(s => s.status === 'failed').length < task.subtasks.length) {
      // deadlock guard: unmet deps on failed subtasks
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
        const model = this._routeModel(this.agents.getAgent(st.agent), st.complexity);
        if (model) {
          st.model = model;
          this.emit({ type: 'log', taskId: task.id, agent: st.agent, subtask: st.id, text: `[AURA] Модель для «${st.title}» (${st.complexity}): ${model}\n` });
        }
        const p = this.agents.run(st.agent, prompt, {
          cwd, runId: task.id + ':' + st.id, model,
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
        const fixModel = this._routeModel(fixerAgent, fixComplexity);
        if (fixModel) fixSt.model = fixModel;
        task.subtasks.push(fixSt);
        this.emit({ type: 'task-updated', task: this.publicTask(task) });

        const fixRes = await this.agents.run(fixer,
          `Ревьюер нашёл проблемы в работе по задаче: "${task.input}".\n\nЗамечания ревьюера:\n${verdict.slice(-4000)}\n\nИсправь все перечисленные проблемы в файлах текущей директории. После исправления кратко перечисли, что изменил.`,
          { cwd, runId: task.id + ':' + fixSt.id, model: fixModel, onData: t => this.emit({ type: 'log', taskId: task.id, agent: fixer, subtask: fixSt.id, text: t }) });
        fixSt.output = fixRes.output;
        fixSt.status = fixRes.ok ? 'done' : 'failed';
        this.emit({ type: 'task-updated', task: this.publicTask(task) });
        if (!fixRes.ok) break;

        const reRes = await this.agents.run(review.agent,
          `Повторно проверь работу в текущей директории по задаче: "${task.input}". Если всё корректно — ответь строкой APPROVED. Иначе перечисли оставшиеся проблемы.`,
          { cwd, runId: task.id + ':' + review.id + '-re' + round, model: this._routeModel(this.agents.getAgent(review.agent), review.complexity || 'standard'), onData: t => this.emit({ type: 'log', taskId: task.id, agent: review.agent, subtask: review.id, text: t }) });
        verdict = reRes.ok ? reRes.output : '';
        review.output += '\n\n--- Повторное ревью (раунд ' + round + ') ---\n' + reRes.output;
      }
    }
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

module.exports = { Orchestrator };
