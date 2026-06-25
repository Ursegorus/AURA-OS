/**
 * AURA OS — Dynamic Harness engine + Ralph Loop runner.
 *
 * Идея (harness engineering, 2026): «модель — commodity, harness — moat».
 * Одна и та же модель в разной обвязке даёт кратную разницу качества.
 * AURA — harness-оркестратор: состояние задачи живёт в файлах и переменных
 * оркестратора, а НЕ в контексте модели (как в Claude Code dynamic workflows).
 *
 * Ядро (бесплатно):
 *   - Dynamic Harness: авто-выбор паттерна (single / loop-until-done / fan-out-synthesize)
 *   - Ralph Loop: запуск агента в цикле до готовности с backpressure и лимитом итераций
 *
 * Pro (модуль aura-pro) дополняет:
 *   - полный набор из 6 паттернов (adversarial / tournament / generate-and-filter / classify-and-act)
 *   - Smart Zone — дробление контекста <40%, чтобы модель не тупела
 *   - Self-Improving Loop — вердикты верификатора → правила в CONSTRAINTS.md
 *   - loop-cost guard — оценка и жёсткий лимит расхода токенов
 *   - фазовая автономия L1/L2/L3
 *
 * Core работает без aura-pro (graceful degradation): getPro() вернёт null.
 */
const path = require('path');
const fs = require('fs');

let hseq = 0;
const nid = (p) => p + '-' + (++hseq) + '-' + Date.now().toString(36);

/** Грубая оценка токенов (≈4 символа на токен). */
function estTokens(str) { return Math.ceil((String(str || '').length) / 4); }

/** Паттерны, доступные без Pro. */
const CORE_PATTERNS = ['single', 'loop-until-done', 'fan-out-synthesize'];

/** Маркер завершения, который агент печатает, когда вся цель достигнута. */
const DONE_SENTINEL = 'AURA_LOOP_DONE';

// ============================================================
//  DYNAMIC HARNESS — авто-подбор паттерна под задачу
// ============================================================

class HarnessEngine {
  constructor({ agents, memory, store, emit, getPro }) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this.getPro = getPro || (() => null);
    this.tasks = new Map();
    this._running = new Map();
  }

  workspaceDir() {
    let ws = this.store.get('workspace', '');
    if (!ws) ws = path.join(require('os').homedir(), 'AURA-Workspace');
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
    return ws;
  }

  /**
   * Базовая (ядро) эвристика выбора паттерна. Если установлен Pro —
   * делегируем его умному классификатору (6 паттернов).
   * @returns {{pattern, reason, complexity, proAdvanced:boolean}}
   */
  classify(input) {
    const pro = this.getPro();
    if (pro && pro.harness && typeof pro.harness.classify === 'function') {
      try {
        const r = pro.harness.classify(input);
        if (r && r.pattern) return { ...r, proAdvanced: true };
      } catch (_) { /* fall back to core */ }
    }
    const s = (input || '').toLowerCase();
    const len = s.length;
    // эвристики ядра
    const fanWords = ['все ', 'каждый', 'весь проект', 'по всем', 'audit', 'аудит', 'просканируй', 'across', 'all files', 'массов'];
    const loopWords = ['пока не', 'до победного', 'итеративно', 'до зелён', 'until', 'повторяй', 'дораб', 'улучшай', 'fix all', 'почини все'];
    let pattern = 'single', reason = 'Простая задача — один проход агента.';
    if (loopWords.some(w => s.includes(w)) || /тест|сборк|build|test/.test(s)) {
      pattern = 'loop-until-done';
      reason = 'Цель проверяема и требует итераций — Ralph loop до готовности.';
    } else if (fanWords.some(w => s.includes(w)) || len > 400) {
      pattern = 'fan-out-synthesize';
      reason = 'Широкая задача по многим объектам — разветвление и синтез.';
    }
    const complexity = len > 300 ? 'complex' : (len > 120 ? 'standard' : 'trivial');
    return { pattern, reason, complexity, proAdvanced: false };
  }

  /** Только спланировать (без запуска) — для предпросмотра в UI. */
  plan(input) {
    const c = this.classify(input);
    const pro = this.getPro();
    const allPatterns = (pro && pro.harness && pro.harness.PATTERNS) || CORE_PATTERNS;
    return {
      input,
      pattern: c.pattern,
      reason: c.reason,
      complexity: c.complexity,
      proAdvanced: !!c.proAdvanced,
      availablePatterns: allPatterns,
      proInstalled: !!pro
    };
  }

  _coordinator(available) {
    const id = this.store.get('coordinator', '');
    return available.find(a => a.id === id) ||
      available.find(a => a.roles && a.roles.includes('coordinator')) ||
      available[0];
  }

  async _available() {
    const availability = await this.agents.detectAll();
    const enabled = this.store.get('enabledAgents', {});
    return this.agents.getAgents().filter(a =>
      availability[a.id] && availability[a.id].available && enabled[a.id] !== false);
  }

  _modelFor(agent, complexity) {
    const pro = this.getPro();
    if (pro && typeof pro.routeModel === 'function') {
      try { return pro.routeModel(pro.patchAgentDef ? pro.patchAgentDef({ ...agent }) : agent, complexity); }
      catch (_) { return undefined; }
    }
    return undefined;
  }

  _withConstraints(prompt) {
    try {
      const c = this.memory.loadConstraints ? this.memory.loadConstraints() : '';
      return c ? c + '\n\n---\n\n' + prompt : prompt;
    } catch (_) { return prompt; }
  }

  /** Запустить динамический харнес: классифицировать и исполнить выбранный паттерн. */
  async start(input, opts = {}) {
    const taskId = nid('harness');
    const cwd = this.workspaceDir();
    const plan = opts.pattern ? { pattern: opts.pattern, reason: 'Паттерн выбран вручную.', complexity: opts.complexity || 'standard' } : this.classify(input);
    const task = {
      id: taskId, input, title: input.slice(0, 60), status: 'running',
      engine: 'harness', pattern: plan.pattern, startedAt: Date.now(),
      subtasks: [], summary: '', output: ''
    };
    this.tasks.set(taskId, task);
    this.emit({ type: 'task-created', task: this.publicTask(task) });
    this.emit({ type: 'log', taskId, agent: 'aura', text: `[AURA] Динамический харнес: паттерн «${plan.pattern}». ${plan.reason}\n` });

    const available = await this._available();
    if (available.length === 0) {
      task.status = 'failed';
      task.summary = 'Нет установленных агентов.';
      this.emit({ type: 'task-updated', task: this.publicTask(task) });
      return taskId;
    }

    try {
      const pro = this.getPro();
      // Pro-паттерны исполняет сам Pro-модуль, передавая ему контекст исполнения.
      if (plan.proAdvanced && pro && pro.harness && typeof pro.harness.run === 'function' &&
          !CORE_PATTERNS.includes(plan.pattern)) {
        await pro.harness.run(plan.pattern, this._proContext(task, available, cwd, plan));
      } else if (plan.pattern === 'fan-out-synthesize') {
        await this._runFanOut(task, available, cwd, plan);
      } else if (plan.pattern === 'loop-until-done') {
        await this._runLoopPattern(task, available, cwd, plan, opts);
      } else {
        await this._runSingle(task, available, cwd, plan);
      }
    } catch (e) {
      task.status = 'failed';
      task.summary = 'Ошибка харнеса: ' + e.message;
    }

    if (task.status === 'running') task.status = 'completed';
    this._finish(task);
    return taskId;
  }

  _proContext(task, available, cwd, plan) {
    return {
      task, available, cwd, plan,
      agents: this.agents, memory: this.memory, store: this.store,
      emit: (e) => this.emit(e),
      run: (agentId, prompt, o = {}) => this.agents.run(agentId, this._withConstraints(prompt), {
        cwd, runId: task.id + ':' + (o.runId || nid('s')),
        model: this._modelFor(this.agents.getAgent(agentId), o.complexity || plan.complexity),
        onData: (text) => this.emit({ type: 'log', taskId: task.id, agent: agentId, text })
      }),
      publicTask: (t) => this.publicTask(t)
    };
  }

  async _runSingle(task, available, cwd, plan) {
    const agent = this._coordinator(available);
    const model = this._modelFor(agent, plan.complexity);
    const st = { id: 's1', title: 'Выполнение', agent: agent.id, agentName: agent.name, role: 'coder', status: 'running', model, dependsOn: [], output: '' };
    task.subtasks.push(st);
    this.emit({ type: 'task-updated', task: this.publicTask(task) });
    const res = await this.agents.run(agent.id, this._withConstraints(task.input), {
      cwd, runId: task.id + ':s1', model,
      onData: (text) => this.emit({ type: 'log', taskId: task.id, agent: agent.id, text })
    });
    st.output = res.output; st.status = res.ok ? 'done' : 'failed';
    task.summary = res.output.slice(-1200);
  }

  /** Fan-out: разбить на под-объекты, запустить параллельно, синтезировать. */
  async _runFanOut(task, available, cwd, plan) {
    const lead = this._coordinator(available);
    // 1) разбиение на ветки
    this.emit({ type: 'log', taskId: task.id, agent: lead.id, text: '[AURA] Разбиение на ветки…\n' });
    const splitPrompt = `Задача: "${task.input}".\nРазбей её на 2-5 НЕЗАВИСИМЫХ ветки, которые можно делать параллельно. Ответь ТОЛЬКО JSON-массивом строк-подзадач, без пояснений. Пример: ["ветка 1","ветка 2"].`;
    const splitRes = await this.agents.run(lead.id, splitPrompt, { cwd, runId: task.id + ':split', model: this._modelFor(lead, 'standard') });
    let branches = [];
    const m = (splitRes.output || '').match(/\[[\s\S]*\]/);
    if (m) { try { branches = JSON.parse(m[0]).filter(x => typeof x === 'string'); } catch (_) {} }
    if (branches.length === 0) branches = [task.input];
    branches = branches.slice(0, Math.max(1, this.store.get('maxParallel', 3) * 2));

    // 2) параллельное исполнение (с ограничением параллелизма)
    const maxPar = this.store.get('maxParallel', 3);
    const results = [];
    let idx = 0;
    const workers = [];
    const runBranch = async () => {
      while (idx < branches.length) {
        const i = idx++;
        const branch = branches[i];
        const agent = available[i % available.length];
        const model = this._modelFor(agent, plan.complexity);
        const st = { id: 'b' + (i + 1), title: branch.slice(0, 50), agent: agent.id, agentName: agent.name, role: 'coder', status: 'running', model, dependsOn: [], output: '' };
        task.subtasks.push(st);
        this.emit({ type: 'task-updated', task: this.publicTask(task) });
        const res = await this.agents.run(agent.id, this._withConstraints(`Часть общей задачи "${task.input}":\n${branch}\n\nВыполни ТОЛЬКО эту часть. Файлы — в рабочей директории.`), {
          cwd, runId: task.id + ':b' + i, model,
          onData: (text) => this.emit({ type: 'log', taskId: task.id, agent: agent.id, subtask: st.id, text })
        });
        st.output = res.output; st.status = res.ok ? 'done' : 'failed';
        results.push({ branch, output: res.output, ok: res.ok });
        this.emit({ type: 'task-updated', task: this.publicTask(task) });
      }
    };
    for (let w = 0; w < Math.min(maxPar, branches.length); w++) workers.push(runBranch());
    await Promise.all(workers);

    // 3) синтез
    this.emit({ type: 'log', taskId: task.id, agent: lead.id, text: '\n[AURA] Синтез результатов…\n' });
    const synthPrompt = `Сведи результаты веток в один итог по задаче "${task.input}".\n\n` +
      results.map((r, i) => `[Ветка ${i + 1}] ${r.branch}\n${(r.output || '').slice(-1500)}`).join('\n\n');
    const synth = await this.agents.run(lead.id, synthPrompt, { cwd, runId: task.id + ':synth', model: this._modelFor(lead, 'standard') });
    const st = { id: 'synth', title: 'Синтез', agent: lead.id, agentName: lead.name, role: 'reviewer', status: synth.ok ? 'done' : 'failed', model: this._modelFor(lead, 'standard'), dependsOn: results.map((_, i) => 'b' + (i + 1)), output: synth.output };
    task.subtasks.push(st);
    task.summary = synth.output.slice(-1500);
  }

  /** loop-until-done как разовый паттерн харнеса (без UI-управления). */
  async _runLoopPattern(task, available, cwd, plan, opts) {
    const agent = this._coordinator(available);
    const maxIter = Math.min(opts.maxIterations || 6, 20);
    let iteration = 0, lastOutput = '';
    while (iteration < maxIter) {
      iteration++;
      const st = { id: 'i' + iteration, title: 'Итерация ' + iteration, agent: agent.id, agentName: agent.name, role: 'coder', status: 'running', model: this._modelFor(agent, plan.complexity), dependsOn: [], output: '' };
      task.subtasks.push(st);
      this.emit({ type: 'task-updated', task: this.publicTask(task) });
      const prompt = this._loopPrompt(task.input, iteration, lastOutput, '');
      const res = await this.agents.run(agent.id, this._withConstraints(prompt), {
        cwd, runId: task.id + ':i' + iteration, model: st.model,
        onData: (text) => this.emit({ type: 'log', taskId: task.id, agent: agent.id, text })
      });
      st.output = res.output; st.status = res.ok ? 'done' : 'failed';
      lastOutput = res.output;
      if (this._isDone(res.output, cwd)) {
        this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: `\n[AURA] Цель достигнута на итерации ${iteration}.\n` });
        break;
      }
    }
    task.summary = `Итераций: ${iteration}. ${lastOutput.slice(-800)}`;
  }

  _loopPrompt(goal, iteration, lastOutput, backpressure) {
    return [
      `Цель (Ralph loop, итерация ${iteration}): ${goal}`,
      lastOutput ? `\nЧто уже сделано в прошлой итерации (кратко):\n${lastOutput.slice(-1500)}` : '',
      backpressure ? `\nРезультат проверки (backpressure):\n${backpressure.slice(-1000)}` : '',
      '',
      'Сделай ОДИН следующий конкретный шаг к цели в рабочей директории. Двигайся маленькими шагами.',
      `Когда ВСЯ цель полностью достигнута и проверена — выведи отдельной строкой ровно: ${DONE_SENTINEL}`,
      'Иначе кратко опиши, что сделал и что осталось.'
    ].filter(Boolean).join('\n');
  }

  _isDone(output, cwd) {
    if (new RegExp(DONE_SENTINEL).test(output || '')) return true;
    try { if (fs.existsSync(path.join(cwd, 'done.txt'))) { fs.unlinkSync(path.join(cwd, 'done.txt')); return true; } } catch (_) {}
    return false;
  }

  _finish(task) {
    // Self-Improving Loop (Pro): извлечь правила из вердикта и записать в CONSTRAINTS.md
    const pro = this.getPro();
    if (pro && pro.selfImproving && typeof pro.selfImproving.learnFromVerdict === 'function') {
      try {
        const verdict = task.subtasks.filter(s => s.role === 'reviewer').map(s => s.output).join('\n') || task.summary;
        const rules = pro.selfImproving.learnFromVerdict(verdict) || [];
        for (const rule of rules) {
          if (this.memory.appendConstraint) this.memory.appendConstraint(rule, 'harness:' + task.pattern);
        }
        if (rules.length) this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: `\n[AURA Pro] Самообучение: +${rules.length} правил в CONSTRAINTS.md\n` });
      } catch (_) {}
    }
    try {
      const note = this.memory.saveTaskNote({
        id: task.id, input: task.input, title: task.title, status: task.status,
        summary: task.summary, subtasks: task.subtasks.map(s => ({ ...s, agentName: s.agentName || s.agent }))
      });
      if (note) this.emit({ type: 'log', taskId: task.id, agent: 'aura', text: '\n[AURA] Сохранено в память: ' + note + '\n' });
    } catch (_) {}
    this.emit({ type: 'task-updated', task: this.publicTask(task) });
  }

  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    for (const st of task.subtasks) this.agents.cancel(task.id + ':' + st.id);
    task.status = 'cancelled';
    this.emit({ type: 'task-updated', task: this.publicTask(task) });
    return true;
  }

  publicTask(task) {
    return {
      id: task.id, input: task.input, title: task.title, status: task.status,
      engine: task.engine, pattern: task.pattern, startedAt: task.startedAt, summary: task.summary,
      subtasks: (task.subtasks || []).map(st => ({
        id: st.id, title: st.title, agent: st.agent, agentName: st.agentName,
        role: st.role, status: st.status, dependsOn: st.dependsOn || [],
        complexity: st.complexity, model: st.model, output: (st.output || '').slice(-4000)
      }))
    };
  }

  listTasks() { return Array.from(this.tasks.values()).map(t => this.publicTask(t)); }
}

// ============================================================
//  RALPH LOOP RUNNER — управляемый из UI долгоиграющий цикл
// ============================================================

class LoopRunner {
  constructor({ agents, memory, store, emit, getPro }) {
    this.agents = agents;
    this.memory = memory;
    this.store = store;
    this.emit = emit;
    this.getPro = getPro || (() => null);
    this.loops = new Map(); // id -> loop state
  }

  workspaceDir() {
    let ws = this.store.get('workspace', '');
    if (!ws) ws = path.join(require('os').homedir(), 'AURA-Workspace');
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
    return ws;
  }

  async _coordinator() {
    const availability = await this.agents.detectAll();
    const enabled = this.store.get('enabledAgents', {});
    const available = this.agents.getAgents().filter(a =>
      availability[a.id] && availability[a.id].available && enabled[a.id] !== false);
    if (available.length === 0) return null;
    const id = this.store.get('coordinator', '');
    return available.find(a => a.id === id) ||
      available.find(a => a.roles && a.roles.includes('coordinator')) || available[0];
  }

  _modelFor(agent, complexity) {
    const pro = this.getPro();
    if (pro && typeof pro.routeModel === 'function') {
      try { return pro.routeModel(pro.patchAgentDef ? pro.patchAgentDef({ ...agent }) : agent, complexity || 'complex'); }
      catch (_) { return undefined; }
    }
    return undefined;
  }

  _withConstraints(prompt) {
    try { const c = this.memory.loadConstraints ? this.memory.loadConstraints() : ''; return c ? c + '\n\n---\n\n' + prompt : prompt; }
    catch (_) { return prompt; }
  }

  /**
   * Старт Ralph loop.
   * opts: { maxIterations, backpressureCmd, autonomy('L1'|'L2'|'L3'), costCapUsd }
   */
  async start(input, opts = {}) {
    const pro = this.getPro();
    const id = nid('loop');
    const cwd = this.workspaceDir();

    // Фазовая автономия и cost-guard — Pro. Без Pro доступен только L3 без жёсткого лимита.
    let autonomy = opts.autonomy || 'L3';
    let proNote = '';
    if ((autonomy === 'L1' || autonomy === 'L2' || opts.costCapUsd) && !(pro && pro.selfImproving)) {
      autonomy = 'L3';
      proNote = ' (L1/L2 и cost-guard доступны в AURA Pro — выполняю в L3)';
    }

    const loop = {
      id, input, cwd, status: 'running', engine: 'loop',
      title: input.slice(0, 60), startedAt: Date.now(),
      iteration: 0, maxIterations: Math.min(opts.maxIterations || 10, 50),
      backpressureCmd: opts.backpressureCmd || '',
      autonomy, costCapUsd: opts.costCapUsd || 0,
      spentUsd: 0, subtasks: [], summary: '', stop: false, awaiting: false
    };
    this.loops.set(id, loop);
    this.emit({ type: 'task-created', task: this.publicLoop(loop) });
    this.emit({ type: 'log', taskId: id, agent: 'aura', text: `[AURA] Ralph Loop стартовал. Автономия: ${autonomy}${proNote}. Лимит итераций: ${loop.maxIterations}.\n` });

    const agent = await this._coordinator();
    if (!agent) {
      loop.status = 'failed'; loop.summary = 'Нет установленных агентов.';
      this.emit({ type: 'task-updated', task: this.publicLoop(loop) });
      return id;
    }

    // L1 — только отчёт: один проход, агент НЕ меняет проект, а предлагает план.
    if (autonomy === 'L1') {
      await this._runIteration(loop, agent, 'L1');
      loop.status = 'completed';
      loop.summary = 'L1 (только отчёт): предложение готово, изменения не применялись.';
      this._finish(loop);
      return id;
    }

    this._runLoop(loop, agent).catch(err => {
      loop.status = 'failed'; loop.summary = 'Ошибка цикла: ' + err.message;
      this._finish(loop);
    });
    return id;
  }

  async _runLoop(loop, agent) {
    let lastOutput = '', backpressure = '';
    while (!loop.stop && loop.iteration < loop.maxIterations) {
      // cost-guard (Pro)
      const pro = this.getPro();
      if (loop.costCapUsd && pro && pro.selfImproving && typeof pro.selfImproving.estimateCost === 'function') {
        const proj = pro.selfImproving.estimateCost({ iterations: loop.iteration + 1, avgTokens: 4000 }, this._modelFor(agent, 'complex'));
        if (proj && proj.usd && (loop.spentUsd + proj.usd) > loop.costCapUsd) {
          this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: `\n[AURA Pro] Достигнут лимит расхода $${loop.costCapUsd}. Цикл остановлен.\n` });
          break;
        }
      }

      loop.iteration++;
      const out = await this._runIteration(loop, agent, loop.autonomy, lastOutput, backpressure);
      lastOutput = out;

      // backpressure: прогон тест-команды (ограничитель)
      backpressure = '';
      if (loop.backpressureCmd) {
        backpressure = await this._runBackpressure(loop);
      }

      if (this._isDone(lastOutput, loop.cwd)) {
        this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: `\n[AURA] Цель достигнута на итерации ${loop.iteration}.\n` });
        break;
      }

      // L2 — подтверждение между итерациями
      if (loop.autonomy === 'L2' && !loop.stop && loop.iteration < loop.maxIterations) {
        loop.awaiting = true;
        this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: `\n[AURA] L2: жду подтверждения для итерации ${loop.iteration + 1}. Нажмите «Продолжить» или «Стоп».\n` });
        this.emit({ type: 'task-updated', task: this.publicLoop(loop) });
        const go = await this._waitConfirm(loop);
        loop.awaiting = false;
        if (!go) { this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: '[AURA] Остановлено пользователем.\n' }); break; }
      }
    }
    if (loop.status === 'running') loop.status = loop.stop ? 'cancelled' : 'completed';
    loop.summary = `Итераций: ${loop.iteration}. ${lastOutput.slice(-800)}`;
    this._finish(loop);
  }

  async _runIteration(loop, agent, autonomy, lastOutput = '', backpressure = '') {
    const model = this._modelFor(agent, 'complex');
    const st = { id: 'i' + loop.iteration, title: 'Итерация ' + (loop.iteration || 1), agent: agent.id, agentName: agent.name, role: 'coder', status: 'running', model, dependsOn: [], output: '' };
    loop.subtasks.push(st);
    this.emit({ type: 'task-updated', task: this.publicLoop(loop) });

    const reportOnly = autonomy === 'L1';
    const prompt = [
      `Цель (Ralph loop): ${loop.input}`,
      lastOutput ? `\nПрошлая итерация (кратко):\n${lastOutput.slice(-1500)}` : '',
      backpressure ? `\nРезультат проверки (backpressure):\n${backpressure.slice(-1200)}` : '',
      '',
      reportOnly
        ? 'РЕЖИМ ТОЛЬКО ОТЧЁТ: НЕ меняй файлы. Опиши план: что и как ты бы сделал по шагам.'
        : 'Сделай ОДИН следующий конкретный шаг к цели в рабочей директории. Двигайся маленькими шагами.',
      reportOnly ? '' : `Когда ВСЯ цель достигнута и проверена — выведи отдельной строкой ровно: ${DONE_SENTINEL}`,
      reportOnly ? '' : 'Иначе кратко опиши, что сделал и что осталось.'
    ].filter(Boolean).join('\n');

    const res = await this.agents.run(agent.id, this._withConstraints(prompt), {
      cwd: loop.cwd, runId: loop.id + ':i' + loop.iteration, model,
      onData: (text) => this.emit({ type: 'log', taskId: loop.id, agent: agent.id, text })
    });
    st.output = res.output; st.status = res.ok ? 'done' : 'failed';
    // учёт расхода (грубо)
    loop.spentUsd += this._iterCostUsd(prompt, res.output, model);
    this.emit({ type: 'task-updated', task: this.publicLoop(loop) });
    return res.output;
  }

  _iterCostUsd(prompt, output, model) {
    const pro = this.getPro();
    if (pro && pro.selfImproving && typeof pro.selfImproving.actualCost === 'function') {
      try { return pro.selfImproving.actualCost(estTokens(prompt), estTokens(output), model) || 0; } catch (_) {}
    }
    // грубая оценка по дефолтной цене (Sonnet-класс): $3/$15 за MTok
    return (estTokens(prompt) * 3 + estTokens(output) * 15) / 1e6;
  }

  _runBackpressure(loop) {
    return new Promise(resolve => {
      const isWin = process.platform === 'win32';
      const child = require('child_process').spawn(isWin ? 'cmd.exe' : 'sh',
        [isWin ? '/c' : '-c', loop.backpressureCmd], { cwd: loop.cwd, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } });
      let out = '';
      child.stdout.on('data', d => out += d.toString());
      child.stderr.on('data', d => out += d.toString());
      const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, 120000);
      child.on('close', (code) => {
        clearTimeout(timer);
        const verdict = (code === 0 ? 'PASS' : 'FAIL (код ' + code + ')') + '\n' + out.slice(-1500);
        this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: `\n[AURA] Backpressure: ${code === 0 ? '✓ PASS' : '✗ FAIL'}\n` });
        resolve(verdict);
      });
      child.on('error', (e) => { clearTimeout(timer); resolve('FAIL: ' + e.message); });
    });
  }

  _waitConfirm(loop) {
    return new Promise(resolve => { loop._resolveConfirm = resolve; });
  }

  /** Возобновить L2-цикл (продолжить/стоп). */
  confirm(id, go) {
    const loop = this.loops.get(id);
    if (loop && loop._resolveConfirm) { const r = loop._resolveConfirm; loop._resolveConfirm = null; r(!!go); return true; }
    return false;
  }

  _isDone(output, cwd) {
    if (new RegExp(DONE_SENTINEL).test(output || '')) return true;
    try { if (fs.existsSync(path.join(cwd, 'done.txt'))) { fs.unlinkSync(path.join(cwd, 'done.txt')); return true; } } catch (_) {}
    return false;
  }

  _finish(loop) {
    const pro = this.getPro();
    if (pro && pro.selfImproving && typeof pro.selfImproving.learnFromVerdict === 'function') {
      try {
        const rules = pro.selfImproving.learnFromVerdict(loop.summary + '\n' + (loop.subtasks.slice(-1)[0] || {}).output) || [];
        for (const rule of rules) if (this.memory.appendConstraint) this.memory.appendConstraint(rule, 'loop');
        if (rules.length) this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: `\n[AURA Pro] Самообучение: +${rules.length} правил в CONSTRAINTS.md\n` });
      } catch (_) {}
    }
    try {
      const note = this.memory.saveTaskNote({
        id: loop.id, input: loop.input, title: loop.title, status: loop.status, summary: loop.summary,
        subtasks: loop.subtasks.map(s => ({ ...s, agentName: s.agentName || s.agent }))
      });
      if (note) this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: '\n[AURA] Сохранено в память: ' + note + '\n' });
    } catch (_) {}
    if (loop.costCapUsd || loop.spentUsd) {
      this.emit({ type: 'log', taskId: loop.id, agent: 'aura', text: `[AURA] Примерный расход: $${loop.spentUsd.toFixed(4)}${loop.costCapUsd ? ' / лимит $' + loop.costCapUsd : ''}\n` });
    }
    this.emit({ type: 'task-updated', task: this.publicLoop(loop) });
  }

  stop(id) {
    const loop = this.loops.get(id);
    if (!loop) return false;
    loop.stop = true;
    if (loop._resolveConfirm) { const r = loop._resolveConfirm; loop._resolveConfirm = null; r(false); }
    for (const st of loop.subtasks) this.agents.cancel(loop.id + ':' + st.id);
    if (loop.status === 'running') { loop.status = 'cancelled'; this.emit({ type: 'task-updated', task: this.publicLoop(loop) }); }
    return true;
  }

  /** Грубая оценка стоимости до запуска (ядро). Pro даёт точную по модели. */
  estimateCost(input, opts = {}) {
    const pro = this.getPro();
    const iters = Math.min(opts.maxIterations || 10, 50);
    if (pro && pro.selfImproving && typeof pro.selfImproving.estimateCost === 'function') {
      try {
        const r = pro.selfImproving.estimateCost({ iterations: iters, avgTokens: 4000 }, opts.model);
        if (r) return { ...r, pro: true };
      } catch (_) {}
    }
    const usd = iters * (4000 * 3 + 2000 * 15) / 1e6; // грубо: вход 4k, выход 2k, Sonnet-класс
    return { usd: Math.round(usd * 100) / 100, iterations: iters, pro: false, note: 'Грубая оценка. Точная — в AURA Pro.' };
  }

  publicLoop(loop) {
    return {
      id: loop.id, input: loop.input, title: loop.title, status: loop.status,
      engine: 'loop', pattern: 'ralph-loop', startedAt: loop.startedAt, summary: loop.summary,
      iteration: loop.iteration, maxIterations: loop.maxIterations, autonomy: loop.autonomy,
      awaiting: loop.awaiting, spentUsd: Math.round(loop.spentUsd * 10000) / 10000,
      subtasks: (loop.subtasks || []).map(st => ({
        id: st.id, title: st.title, agent: st.agent, agentName: st.agentName,
        role: st.role, status: st.status, model: st.model, dependsOn: st.dependsOn || [],
        output: (st.output || '').slice(-4000)
      }))
    };
  }

  listLoops() { return Array.from(this.loops.values()).map(l => this.publicLoop(l)); }
}

module.exports = { HarnessEngine, LoopRunner, CORE_PATTERNS, DONE_SENTINEL, estTokens };
