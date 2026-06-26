/* AURA OS — renderer logic */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  tasks: [],          // public task objects from main
  logs: {},           // taskId -> log text
  agents: [],
  settings: {},
  activeNote: null
};

/* ---------- i18n ---------- */
function applyI18n() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('#btn-voice').title = t('voice_hint');
}

/* ---------- window controls ---------- */
$('#tb-minimize').addEventListener('click', () => window.aura.window.minimize());
$('#tb-maximize').addEventListener('click', () => window.aura.window.maximize());
$('#tb-close').addEventListener('click', () => window.aura.window.close());
window.aura.window.onMaximized(() => {
  $('#tb-maximize').innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="3.5" y="0.5" width="8" height="8" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 2v7.5a1.5 1.5 0 001.5 1.5H11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 2h6a1.5 1.5 0 011.5 1.5V10" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  $('#tb-maximize').title = 'Восстановить';
});
window.aura.window.onUnmaximized(() => {
  $('#tb-maximize').innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  $('#tb-maximize').title = 'Развернуть';
});
// Sync initial state
window.aura.window.isMaximized().then(m => {
  if (m) {
    $('#tb-maximize').innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="3.5" y="0.5" width="8" height="8" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 2v7.5a1.5 1.5 0 001.5 1.5H11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 2h6a1.5 1.5 0 011.5 1.5V10" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
    $('#tb-maximize').title = 'Восстановить';
  }
});

/* ---------- navigation ---------- */
$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + btn.dataset.view).classList.add('active');
  if (btn.dataset.view === 'memory') loadMemory();
  if (btn.dataset.view === 'agents') loadAgents();
  if (btn.dataset.view === 'hermes') loadHermesPanel();
  if (btn.dataset.view === 'harness') loadHarness();
}));

/* ---------- Harness sub-tabs ---------- */
$$('.harness-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.harness-tab').forEach(t => t.classList.remove('active'));
  $$('.harness-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const panel = document.getElementById('harness-' + tab.dataset.harnessTab);
  if (panel) panel.classList.add('active');
  if (tab.dataset.harnessTab === 'templates') renderTemplates();
  if (tab.dataset.harnessTab === 'constraints') loadConstraints();
  if (tab.dataset.harnessTab === 'pro') loadProStatus();
}));

/* ---------- Hermes tabs ---------- */
$$('.hermes-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.hermes-tab').forEach(t => t.classList.remove('active'));
  $$('.hermes-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const panel = document.getElementById('hermes-' + tab.dataset.hermesTab);
  if (panel) panel.classList.add('active');
  if (tab.dataset.hermesTab === 'shop') {
    if ($('#shop-results').children.length === 0) loadShopResults($('#shop-source').value);
    return;
  }
  loadHermesData(tab.dataset.hermesTab);
}));

/* ---------- tasks ---------- */
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTasks() {
  const list = $('#task-list');
  if (state.tasks.length === 0) {
    list.innerHTML = `<div class="empty">${esc(t('no_tasks'))}</div>`;
    return;
  }
  list.innerHTML = state.tasks.map(task => {
    const stClass = task.status.replace(/_/g, '-');
    const subtasks = (task.subtasks || []).map(st => `
      <div class="subtask ${st.status}">
        <span class="dot"></span>
        <span>${esc(st.title)}</span>
        <span class="agent-chip">${esc(st.agentName || st.agent)}${st.model ? ' · ' + esc(st.model) : ''} · ${esc(t('st_' + st.status) || st.status)}${st.dependsOn && st.dependsOn.length ? ' · ' + t('requires') + ' ' + st.dependsOn.join(',') : ''}</span>
      </div>`).join('');
    const log = state.logs[task.id] || '';
    const active = task.status === 'running' || task.status === 'planning';
    const patternChip = task.pattern ? `<span class="pattern-chip">⟳ ${esc(task.pattern)}${task.iteration ? ' · ' + task.iteration + (task.maxIterations ? '/' + task.maxIterations : '') : ''}${typeof task.spentUsd === 'number' && task.spentUsd > 0 ? ' · $' + task.spentUsd.toFixed(3) : ''}</span>` : '';
    return `
    <div class="task-card" data-task="${task.id}">
      <div class="task-head">
        <div class="task-title">${patternChip}${esc(task.input.slice(0, 120))}</div>
        <span class="pill ${stClass}">${esc(t('status_' + task.status.replace(/-/g, '_')))}</span>
      </div>
      ${subtasks ? `<div class="subtask-flow">${subtasks}</div>` : ''}
      <details ${active ? 'open' : ''}>
        <summary>${esc(t('log'))}</summary>
        <div class="task-log" id="log-${task.id}">${esc(log.slice(-12000))}</div>
      </details>
      ${task.summary ? `<div class="task-summary"><b>${esc(t('summary'))}:</b>\n${esc(task.summary)}</div>` : ''}
      <div class="task-actions">
        ${task.awaiting ? `<button class="btn primary" data-confirm-go="${task.id}">▶ ${esc(t('run'))}</button>` : ''}
        ${active ? `<button class="btn danger" data-cancel="${task.id}">${esc(t('cancel'))}</button>` : ''}
        <button class="btn ghost" data-open-ws="1">${esc(t('open_workspace'))}</button>
      </div>
    </div>`;
  }).join('');

  $$('[data-cancel]').forEach(b => b.addEventListener('click', () => window.aura.task.cancel(b.dataset.cancel)));
  $$('[data-confirm-go]').forEach(b => b.addEventListener('click', () => window.aura.loop.confirm(b.dataset.confirmGo, true)));
  $$('[data-open-ws]').forEach(b => b.addEventListener('click', () => {
    const ws = state.settings.workspace || '';
    if (ws) window.aura.openPath(ws);
  }));
  // autoscroll logs
  $$('.task-log').forEach(el => { el.scrollTop = el.scrollHeight; });
}

function upsertTask(task) {
  const i = state.tasks.findIndex(x => x.id === task.id);
  if (i >= 0) state.tasks[i] = task; else state.tasks.unshift(task);
  renderTasks();
}

// Поле ввода растёт под объём текста, но не выше окна (max-height в CSS = 60vh).
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  const max = Math.max(120, Math.floor(window.innerHeight * 0.6));
  const h = Math.min(el.scrollHeight, max);
  el.style.height = h + 'px';
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}
// Подключаем авто-рост ко всем композер-полям + сброс высоты при очистке.
['#task-input', '#harness-input', '#loop-input'].forEach(sel => {
  const el = $(sel);
  if (el) { el.addEventListener('input', () => autoGrow(el)); autoGrow(el); }
});

async function startTask() {
  const input = $('#task-input').value.trim();
  if (!input) return;
  $('#task-input').value = '';
  autoGrow($('#task-input'));
  await window.aura.task.start(input);
}

$('#btn-run').addEventListener('click', startTask);
$('#task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    startTask();
  }
});

/* voice input: Web Speech if available, otherwise Win+H hint */
$('#btn-voice').addEventListener('click', () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    try {
      const rec = new SR();
      rec.lang = LANG === 'ru' ? 'ru-RU' : 'en-US';
      rec.interimResults = false;
      rec.onresult = (e) => {
        $('#task-input').value += (($('#task-input').value ? ' ' : '') + e.results[0][0].transcript);
      };
      rec.onerror = () => { $('#task-input').focus(); alert(t('voice_hint')); };
      rec.start();
      return;
    } catch (_) { /* fall through */ }
  }
  $('#task-input').focus();
  alert(t('voice_hint'));
});

/* ---------- events from main ---------- */
window.aura.onEvent((ev) => {
  if (ev.type === 'task-created' || ev.type === 'task-updated') {
    upsertTask(ev.task);
  } else if (ev.type === 'log') {
    state.logs[ev.taskId] = (state.logs[ev.taskId] || '') + ev.text;
    const el = document.getElementById('log-' + ev.taskId);
    if (el) {
      el.textContent = state.logs[ev.taskId].slice(-12000);
      el.scrollTop = el.scrollHeight;
    }
  } else if (ev.type === 'clarify') {
    showClarify(ev.taskId, ev.questions || []);
  }
});

/* ---------- Уточняющие вопросы — пошаговая панель как в Claude (AskUserQuestion) ---------- */
function showClarify(taskId, questions) {
  if (!questions.length) { window.aura.task.clarifyAnswer(taskId, []); return; }
  const old = document.getElementById('clarify-overlay');
  if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'clarify-overlay';
  ov.className = 'clarify-overlay';
  const box = document.createElement('div');
  box.className = 'clarify-box';
  ov.appendChild(box);
  document.body.appendChild(ov);

  // Дефолт выбора каждого вопроса = рекомендация (иначе первый вариант).
  const defLabel = (q) => q.recommended || (q.options[0] && q.options[0].label) || '';
  const picks = questions.map(q => ({ value: defLabel(q), text: '' }));
  let idx = 0;

  const finalize = () => {
    const answers = questions.map((q, i) => {
      const p = picks[i];
      let val = p.value === '__other__' ? (p.text.trim() || defLabel(q)) : p.value;
      return { question: q.question, answer: val };
    });
    window.aura.task.clarifyAnswer(taskId, answers);
    ov.remove();
  };
  const close = () => { window.aura.task.clarifyAnswer(taskId, []); ov.remove(); };

  function render() {
    const q = questions[idx];
    const last = idx === questions.length - 1;
    const multi = questions.length > 1;
    const opts = (q.options || []).map((opt, j) => {
      const rec = opt.label === q.recommended;
      const sel = picks[idx].value === opt.label;
      return `<div class="clarify-opt${sel ? ' selected' : ''}" data-val="${esc(opt.label)}">
        <div class="clarify-opt-main">
          <div class="clarify-opt-label">${esc(opt.label)}${rec ? '<span class="clarify-rec">★ ' + esc(t('clarify_recommended')) + '</span>' : ''}</div>
          ${opt.description ? `<div class="clarify-opt-desc">${esc(opt.description)}</div>` : ''}
        </div>
        <span class="clarify-check" aria-hidden="true"></span>
      </div>`;
    }).join('');
    const otherSel = picks[idx].value === '__other__';
    const otherCard = `<div class="clarify-opt clarify-other${otherSel ? ' selected' : ''}" data-val="__other__">
      <div class="clarify-opt-main">
        <div class="clarify-opt-label">${esc(t('clarify_other'))}</div>
        <input type="text" id="clarify-other-input" class="clarify-other-input" placeholder="${esc(t('clarify_other_ph'))}" value="${esc(picks[idx].text)}" style="${otherSel ? '' : 'display:none'}"/>
      </div>
      <span class="clarify-check" aria-hidden="true"></span>
    </div>`;

    box.innerHTML = `
      <div class="clarify-head">
        ${multi ? `<span class="clarify-progress">${idx + 1}/${questions.length}</span>` : ''}
        <div class="clarify-q-title">${esc(q.question)}</div>
        <button class="clarify-x" id="clarify-close" title="${esc(t('clarify_skip'))}">✕</button>
      </div>
      <div class="clarify-opts">${opts}${otherCard}</div>
      <div class="clarify-actions">
        <button class="btn ghost" id="clarify-back"${idx === 0 ? ' disabled' : ''}>${esc(t('clarify_back'))}</button>
        <div class="clarify-actions-right">
          <button class="btn ghost" id="clarify-skip">${esc(t('clarify_skip'))}</button>
          <button class="btn primary" id="clarify-next">${esc(last ? t('clarify_submit') : t('clarify_next'))} <span class="kbd-hint">Ctrl+Enter</span></button>
        </div>
      </div>`;

    box.querySelectorAll('.clarify-opt').forEach(card => {
      card.addEventListener('click', (e) => {
        picks[idx].value = card.dataset.val;
        if (card.dataset.val === '__other__') {
          render();
          const inp = box.querySelector('#clarify-other-input');
          if (inp) inp.focus();
          return;
        }
        render();
      });
    });
    const oin = box.querySelector('#clarify-other-input');
    if (oin) {
      oin.addEventListener('input', () => { picks[idx].text = oin.value; });
      oin.addEventListener('click', (e) => e.stopPropagation());
    }
    box.querySelector('#clarify-close').addEventListener('click', close);
    box.querySelector('#clarify-back').addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
    box.querySelector('#clarify-skip').addEventListener('click', finalize); // остальное = дефолты
    box.querySelector('#clarify-next').addEventListener('click', () => {
      if (last) finalize(); else { idx++; render(); }
    });
  }

  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      (idx === questions.length - 1) ? finalize() : (idx++, render());
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  render();
}

/* ---------- agents ---------- */
function agentInitial(name) { return (name || '?').trim()[0].toUpperCase(); }

async function loadAgents() {
  state.agents = await window.aura.agents.list();
  const available = state.agents.filter(a => a.available).length;
  $('#agent-count').textContent = available;

  if (available === 0) {
    $('#agents-grid').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⬡</div>
        <h3>Установите бесплатных агентов — за один клик</h3>
        <p class="hint">AURA поставит OpenCode и сразу даст <b>два рабочих агента</b> на бесплатных моделях
        (исполнитель + ревьюер). <b>Без ключей, без регистрации, без карты.</b> Нужен только Node.js — его AURA ставит сама.</p>
        <button class="btn primary" id="btn-install-opencode">+ Установить бесплатных агентов</button>
        <p class="hint" style="margin-top:10px">Бесплатные модели хороши для <b>ответов, черновиков и планов</b>. Для надёжных сборок («сделай лендинг», «собери приложение») подключите агента посильнее — Claude, Codex или Gemini (один клик + вход, указано на карточке).</p>
      </div>`;
    const btn = document.getElementById('btn-install-opencode');
    if (btn) {
      btn.addEventListener('click', async function() {
        this.disabled = true;
        let s = 0;
        const label = (x) => `⋯ Устанавливаю OpenCode… ${x} c (1–2 мин)`;
        this.textContent = label(0);
        const tick = setInterval(() => { s++; this.textContent = label(s); }, 1000);
        const res = await window.aura.agentsInstall({ command: 'opencode-ai' });
        clearInterval(tick);
        if (res.ok) {
          this.textContent = '✓ Готово — 2 агента доступны!';
          setTimeout(() => loadAgents(), 1500);
        } else {
          this.textContent = '✗ Ошибка. Нужен Node.js — установите и повторите.';
          this.disabled = false;
        }
      });
    }
    return;
  }

  $('#agents-grid').innerHTML = state.agents.map(a => {
    const reqClass = a.keyless ? 'keyless' : 'needkey';
    const reqBadge = a.keyless ? '🟢 Без ключей' : '🔑 Нужен вход / ключ';
    const reqLine = a.requirement
      ? `<div class="agent-req ${reqClass}"><b>${reqBadge}.</b> ${esc(a.requirement)}${a.setupUrl ? ` <a href="#" class="agent-setup-link" data-url="${esc(a.setupUrl)}">Инструкция ↗</a>` : ''}</div>`
      : '';
    const installBtn = (!a.available && a.installHint)
      ? `<button class="btn primary btn-install-agent" data-cmd="${esc(a.installHint)}">Установить CLI</button>` : '';
    const howtoBtn = (!a.available && !a.installHint && a.setupUrl)
      ? `<button class="btn ghost btn-setup-link" data-url="${esc(a.setupUrl)}">Как установить ↗</button>` : '';
    const removeBtn = (a.available && a.builtin && a.uninstallHint)
      ? `<button class="btn danger btn-uninstall-agent" data-cmd="${esc(a.uninstallHint)}" data-name="${esc(a.name)}">Удалить CLI</button>` : '';
    const delBtn = a.builtin ? '' : `<button class="btn danger" data-del="${a.id}">${t('delete')}</button>`;
    return `
    <div class="agent-card">
      <div class="agent-top">
        <div class="agent-avatar" style="background:${a.color || '#64748b'}">${agentInitial(a.name)}</div>
        <div>
          <div class="agent-name">${esc(a.name)}</div>
          <div class="agent-vendor">${esc(a.vendor || '')}</div>
        </div>
        <span class="agent-status pill ${a.available ? 'completed' : 'failed'}">${a.available ? t('agent_available') : t('agent_missing')}</span>
      </div>
      ${reqLine}
      <div class="skills">${(a.skills || []).map(s => `<span class="skill-tag">${esc(s)}</span>`).join('')}</div>
      <div class="agent-cmd">$ ${esc(a.command)} ${esc((a.args || []).join(' '))}</div>
      <div class="agent-foot">
        <label class="switch"><input type="checkbox" data-toggle="${a.id}" ${a.enabled ? 'checked' : ''}/> ${t('agent_enabled')}</label>
        ${delBtn}${installBtn}${howtoBtn}${removeBtn}
      </div>
    </div>`; }).join('');

  $$('[data-toggle]').forEach(el => el.addEventListener('change', () =>
    window.aura.agents.toggle(el.dataset.toggle, el.checked)));
  $$('[data-del]').forEach(el => el.addEventListener('click', async () => {
    await window.aura.agents.remove(el.dataset.del);
    loadAgents();
  }));
  $$('.agent-setup-link, .btn-setup-link').forEach(el => el.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (el.dataset.url) window.aura.shellOpenExternal(el.dataset.url);
  }));
  // One-click install CLI
  $$('.btn-install-agent').forEach(el => el.addEventListener('click', async function() {
    const cmd = this.dataset.cmd;
    this.disabled = true;
    let s = 0;
    this.title = 'Установка может занять 1–2 минуты';
    this.textContent = '⋯ 0 c';
    const tick = setInterval(() => { s++; this.textContent = `⋯ ${s} c`; }, 1000);
    const res = await window.aura.agentsInstall({ command: cmd });
    clearInterval(tick);
    if (res.ok) { this.textContent = '[OK]'; setTimeout(() => loadAgents(), 1500); }
    else { this.textContent = '✗ Ошибка'; setTimeout(() => { this.textContent = 'Установить CLI'; this.disabled = false; }, 3000); }
  }));
  // One-click uninstall CLI
  $$('.btn-uninstall-agent').forEach(el => el.addEventListener('click', async function() {
    const cmd = this.dataset.cmd;
    if (!window.confirm(`Удалить CLI «${this.dataset.name}» (npm uninstall -g ${cmd})?\nЕсли на этом CLI работают несколько агентов — пропадут все.`)) return;
    this.disabled = true;
    let s = 0;
    this.textContent = '⋯ 0 c';
    const tick = setInterval(() => { s++; this.textContent = `⋯ ${s} c`; }, 1000);
    const res = await window.aura.agentsUninstall({ command: cmd });
    clearInterval(tick);
    if (res.ok) { this.textContent = 'Удалено'; setTimeout(() => loadAgents(), 1200); }
    else { this.textContent = '✗ Ошибка'; setTimeout(() => { this.textContent = 'Удалить CLI'; this.disabled = false; }, 3000); }
  }));
}

$('#btn-refresh-agents').addEventListener('click', loadAgents);
$('#btn-add-agent').addEventListener('click', () => $('#modal-agent').classList.remove('hidden'));
$('#ag-cancel').addEventListener('click', () => $('#modal-agent').classList.add('hidden'));
$('#ag-save').addEventListener('click', async () => {
  const def = {
    name: $('#ag-name').value.trim(),
    command: $('#ag-command').value.trim(),
    args: $('#ag-args').value.trim().split(/\s+/),
    model: $('#ag-model').value.trim(),
    skills: $('#ag-skills').value.split(',').map(s => s.trim()).filter(Boolean),
    roles: $('#ag-roles').value.split(',').map(s => s.trim()).filter(Boolean)
  };
  if (!def.name || !def.command) return;
  await window.aura.agents.add(def);
  $('#modal-agent').classList.add('hidden');
  loadAgents();
});

/* ---------- memory ---------- */
async function loadMemory() {
  const notes = await window.aura.memory.list();
  const list = $('#memory-list');
  if (notes.length === 0) {
    list.innerHTML = `<div class="empty">${esc(t('memory_empty'))}</div>`;
    $('#memory-content').textContent = '';
    return;
  }
  list.innerHTML = notes.map(n => `
    <div class="memory-item ${state.activeNote === n.path ? 'active' : ''}" data-note="${esc(n.path)}" title="${esc(n.rel || n.name)}">
      <div>${esc(n.name.replace('.md', ''))}</div>
      <div class="date">${esc(n.rel ? n.rel.replace(/\\/g, '/').replace(/\/?[^/]+$/, '') || '/' : '')} · ${new Date(n.mtime).toLocaleDateString()}</div>
    </div>`).join('');
  $$('[data-note]').forEach(el => el.addEventListener('click', async () => {
    state.activeNote = el.dataset.note;
    $('#memory-content').textContent = await window.aura.memory.read(el.dataset.note);
    $$('.memory-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
  }));
}
$('#btn-open-vault').addEventListener('click', () => window.aura.memory.openVault());

const _logsOpen = $('#btn-open-logs');
if (_logsOpen) _logsOpen.addEventListener('click', () => window.aura.logs && window.aura.logs.open());
const _logsDir = $('#btn-open-logs-dir');
if (_logsDir) _logsDir.addEventListener('click', () => window.aura.logs && window.aura.logs.openDir());

/* ---------- settings ---------- */

async function loadSettings() {
  state.settings = await window.aura.settings.get();
  LANG = state.settings.lang || 'ru';
  $('#set-vault').value = state.settings.vaultPath || '';
  $('#set-workspace').value = state.settings.workspace || '';
  $('#set-parallel').value = state.settings.maxParallel;
  $('#set-fix').value = state.settings.maxFixRounds;
  $('#set-review').checked = !!state.settings.reviewEnabled;
  // Движок
  const mode = state.settings.orchestratorMode || 'auto';
  const hermesOk = state.settings.hermesAvailable;
  const opencodeOk = state.settings.opencodeAvailable;
  $('#set-engine').value = mode;
  $('#set-model-cap').value = state.settings.claudeModelCap || 'sonnet';
  // Статус Hermes
  (async () => {
    const st = await window.aura.hermesStatus();
    const el = $('#hermes-status');
    if (el) {
      if (st.ok) el.innerHTML = `<span class="hermes-ok">✓ Hermes Agent: ${esc(st.version)}</span>`;
      else el.innerHTML = `<span class="hermes-err">✗ Hermes Agent не найден</span>`;
    }
  })();
  // Статус OpenCode
  // Статус OpenCode
  (async () => {
    const el = $('#opencode-status');
    if (!el) return;
    if (state.settings.opencodeAvailable) {
      el.innerHTML = `<span class="hermes-ok">✓ OpenCode доступен (бесплатные модели)</span>`;
    } else {
      el.innerHTML = `<span class="hermes-err">✗ OpenCode не установлен</span>`;
      if (state.settings.orchestratorMode === 'opencode') {
        el.innerHTML += ` <button class="btn ghost" id="btn-install-opencode-status">Установить</button>`;
        setTimeout(() => {
          const btn = document.getElementById('btn-install-opencode-status');
          if (btn) btn.addEventListener('click', async function() {
            this.textContent = '⋯';
            const res = await window.aura.agentsInstall({ command: 'opencode-ai@latest' });
            this.textContent = res.ok ? '✓' : '✗ Ошибка';
            if (res.ok) setTimeout(() => location.reload(), 2000);
          });
        }, 100);
      }
    }
  })();
  // Папка базы знаний
  $('#set-knowledge').value = state.settings.knowledgePath || '';
  $('#set-soul').value = state.settings.soulPath || '';
  $('#set-openrouter').value = state.settings.openrouterKey || '';
  $('#set-tg-enabled').checked = !!state.settings.telegramEnabled;
  $('#set-tg-token').value = state.settings.telegramToken || '';
  $('#set-tg-allowed').value = state.settings.telegramAllowed || '';
  $('#set-lang').value = LANG;
  applyI18n();
}

function renderTgStatus(s) {
  const el = $('#tg-status');
  if (!el || !s) return;
  if (s.state === 'online') {
    el.className = 'tg-status ok';
    el.textContent = t('tg_status_online') + (s.username || '') +
      (s.allowed && s.allowed.length ? ' · ' + s.allowed.length + ' chat ID' : '');
  } else if (s.state === 'error') {
    el.className = 'tg-status err';
    el.textContent = t('tg_status_error') + (s.error || '');
  } else {
    el.className = 'tg-status';
    el.textContent = t('tg_status_disabled');
  }
}
window.aura.telegram.onStatus(renderTgStatus);

$('#btn-open-vault').addEventListener('click', () => window.aura.memory.openVault());
$('#btn-open-graph').addEventListener('click', async function () {
  const existing = document.getElementById('graph-modal');
  if (existing) existing.remove();
  const data = await window.aura.memory.getGraph();

  const modal = document.createElement('div');
  modal.id = 'graph-modal';
  const n = (data && data.nodes) ? data.nodes.length : 0;
  const e = (data && data.links) ? data.links.length : 0;
  modal.innerHTML = `
    <div class="graph-head">
      <div><span class="gtitle">◎ Граф знаний</span><span class="gmeta">${n} заметок · ${e} связей</span></div>
      <button id="graph-close" class="btn ghost">✕</button>
    </div>` + (n === 0
      ? `<div class="graph-empty">Нет заметок с [[связями]] в базе. Добавьте wiki-ссылки между файлами.</div>`
      : `<canvas id="graph-canvas"></canvas>`);
  document.body.appendChild(modal);
  document.getElementById('graph-close').addEventListener('click', () => { if (window._graphStop) window._graphStop(); modal.remove(); });
  if (n > 0) renderGraphCanvas(data, document.getElementById('graph-canvas'));
});

/**
 * Рисует граф знаний на canvas без внешних зависимостей.
 * Простая силовая раскладка (отталкивание + пружины + центрирование),
 * затем статичный рендер с панорамой (drag) и зумом (колесо).
 */
function renderGraphCanvas(data, canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const palette = ['#6c8cff','#9d6cff','#38d39f','#f5b34d','#f06a6a','#ec4899','#06b6d4','#84cc16'];
  const groupColor = {};
  let ci = 0;

  // Ограничиваем число узлов для производительности: оставляем самые связанные.
  const deg = {};
  for (const l of data.links) { deg[l.source] = (deg[l.source]||0)+1; deg[l.target] = (deg[l.target]||0)+1; }
  let nodes = data.nodes.slice();
  const CAP = 600;
  if (nodes.length > CAP) {
    nodes = nodes.sort((a,b) => (deg[b.id]||0)-(deg[a.id]||0)).slice(0, CAP);
  }
  const keep = new Set(nodes.map(nn => nn.id));
  const links = data.links.filter(l => keep.has(l.source) && keep.has(l.target));

  const idx = {};
  nodes.forEach((nd, i) => {
    idx[nd.id] = i;
    nd.x = Math.cos(i) * 200 + (Math.random()-0.5)*60;
    nd.y = Math.sin(i) * 200 + (Math.random()-0.5)*60;
    nd.vx = 0; nd.vy = 0;
    if (!groupColor[nd.group]) groupColor[nd.group] = palette[ci++ % palette.length];
    nd.deg = deg[nd.id] || 0;
  });
  const edges = links.map(l => ({ s: idx[l.source], t: idx[l.target] }));

  // Силовая раскладка — фиксированное число итераций (без вечной анимации).
  const ITER = nodes.length > 300 ? 120 : 250;
  const k = 90; // желаемая длина ребра
  for (let it = 0; it < ITER; it++) {
    // отталкивание (O(n^2), но n<=600)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i+1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        let d2 = dx*dx + dy*dy || 0.01;
        const f = (k*k) / d2;
        const d = Math.sqrt(d2);
        const fx = (dx/d)*f, fy = (dy/d)*f;
        nodes[i].vx += fx; nodes[i].vy += fy;
        nodes[j].vx -= fx; nodes[j].vy -= fy;
      }
    }
    // пружины
    for (const ed of edges) {
      const a = nodes[ed.s], b = nodes[ed.t];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx*dx+dy*dy) || 0.01;
      const f = (d - k) * 0.05;
      const fx = (dx/d)*f, fy = (dy/d)*f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    // центрирование + интеграция
    const cool = 1 - it/ITER;
    for (const nd of nodes) {
      nd.vx += -nd.x * 0.002; nd.vy += -nd.y * 0.002;
      nd.x += Math.max(-20, Math.min(20, nd.vx)) * cool;
      nd.y += Math.max(-20, Math.min(20, nd.vy)) * cool;
      nd.vx *= 0.85; nd.vy *= 0.85;
    }
  }

  let scale = 1, ox = 0, oy = 0;
  function resize() {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    draw();
  }
  function draw() {
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
    const cx = canvas.clientWidth/2 + ox, cy = canvas.clientHeight/2 + oy;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    // рёбра
    ctx.strokeStyle = 'rgba(108,140,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ed of edges) { ctx.moveTo(nodes[ed.s].x, nodes[ed.s].y); ctx.lineTo(nodes[ed.t].x, nodes[ed.t].y); }
    ctx.stroke();
    // узлы
    for (const nd of nodes) {
      const r = 3 + Math.min(9, nd.deg);
      ctx.beginPath();
      ctx.fillStyle = groupColor[nd.group] || '#64748b';
      ctx.arc(nd.x, nd.y, r, 0, Math.PI*2); ctx.fill();
    }
    // подписи — только для заметных узлов и при достаточном зуме
    if (scale > 0.7) {
      ctx.fillStyle = '#cdd6e6'; ctx.font = '11px Segoe UI, sans-serif';
      for (const nd of nodes) {
        if (nd.deg >= 2 || scale > 1.4) ctx.fillText(nd.title, nd.x + 6, nd.y + 3);
      }
    }
    ctx.restore();
  }

  // взаимодействие
  let drag = false, lx = 0, ly = 0;
  canvas.addEventListener('mousedown', (ev) => { drag = true; lx = ev.clientX; ly = ev.clientY; });
  window.addEventListener('mouseup', () => { drag = false; });
  canvas.addEventListener('mousemove', (ev) => { if (!drag) return; ox += ev.clientX-lx; oy += ev.clientY-ly; lx = ev.clientX; ly = ev.clientY; draw(); });
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); const f = ev.deltaY < 0 ? 1.1 : 0.9; scale = Math.max(0.15, Math.min(4, scale*f)); draw(); }, { passive: false });
  window.addEventListener('resize', resize);
  window._graphStop = () => window.removeEventListener('resize', resize);
  resize();
}

$('#pick-vault').addEventListener('click', async () => {
  const p = await window.aura.settings.pickFolder('Obsidian vault');
  if (p) $('#set-vault').value = p;
});
$('#pick-knowledge').addEventListener('click', async () => {
  const p = await window.aura.settings.pickFolder('Папка базы знаний');
  if (p) $('#set-knowledge').value = p;
});
$('#pick-workspace').addEventListener('click', async () => {
  const p = await window.aura.settings.pickFolder('Workspace');
  if (p) $('#set-workspace').value = p;
});
$('#pick-soul').addEventListener('click', async () => {
  const p = await window.aura.settings.pickFile('Выбери SOUL/.md файл');
  if (p) $('#set-soul').value = p;
});
$('#btn-save-settings').addEventListener('click', async () => {
  const patch = {
    vaultPath: $('#set-vault').value,
    knowledgePath: $('#set-knowledge').value,
    workspace: $('#set-workspace').value,
    soulPath: $('#set-soul').value,
    openrouterKey: $('#set-openrouter').value.trim(),
    maxParallel: parseInt($('#set-parallel').value, 10) || 3,
    maxFixRounds: parseInt($('#set-fix').value, 10) || 0,
    reviewEnabled: $('#set-review').checked,
    orchestratorMode: $('#set-engine').value,
    claudeModelCap: $('#set-model-cap').value,
    useHermesEngine: false,
    telegramEnabled: $('#set-tg-enabled').checked,
    telegramToken: $('#set-tg-token').value.trim(),
    telegramAllowed: $('#set-tg-allowed').value.trim(),
    lang: $('#set-lang').value
  };
  await window.aura.settings.set(patch);
  state.settings = { ...state.settings, ...patch };
  LANG = patch.lang;
  applyI18n();
  renderTasks();
  $('#settings-saved').textContent = t('saved');
  setTimeout(() => { $('#settings-saved').textContent = ''; }, 2000);
});

/* ---------- Hermes engine panel ---------- */
async function loadHermesPanel() {
  $('#hermes-skills').innerHTML = '<div class="hermes-loading">' + esc(t('hermes_loading')) + '</div>';
  $('#hermes-cron').innerHTML = '<div class="hermes-loading">' + esc(t('hermes_loading')) + '</div>';
  $('#hermes-mcp').innerHTML = '<div class="hermes-loading">' + esc(t('hermes_loading')) + '</div>';
  // Загружаем активную вкладку
  const activeTab = document.querySelector('.hermes-tab.active');
  if (activeTab) loadHermesData(activeTab.dataset.hermesTab);
}

async function loadHermesData(tab) {
  const panel = $('#hermes-' + tab);
  if (!panel) return;
  panel.innerHTML = '<div class="hermes-loading">' + esc(t('hermes_loading')) + '</div>';

  let result;
  if (tab === 'skills') result = await window.aura.hermesExec({ cmd: 'skills', args: ['list'] });
  else if (tab === 'cron') result = await window.aura.hermesExec({ cmd: 'cron', args: ['list'] });
  else if (tab === 'mcp') result = await window.aura.hermesExec({ cmd: 'mcp', args: ['list'] });

  if (!result || !result.ok) {
    panel.innerHTML = '<div class="hermes-error">' + esc(result ? result.output : 'Failed to connect to Hermes') + '</div>';
    return;
  }

  // Skills — карточки, остальное — pre
  if (tab === 'skills') {
    const skills = parseInstalledSkills(result.output);
    if (skills.length === 0) {
      panel.innerHTML = '<div class="shop-hint">' + esc(t('shop_empty')) + '</div>';
      return;
    }
    panel.innerHTML = skills.map(s => `
      <div class="shop-card">
        <div class="shop-card-head">
          <span class="shop-card-name">${esc(s.name)}</span>
          <span class="shop-card-source pill ${esc(s.source)}">${esc(s.source)}</span>
        </div>
        <div class="shop-card-desc">${esc(s.category || '—')}</div>
        <div class="shop-card-foot">
          <span class="pill ${s.status === 'enabled' ? 'completed' : 'failed'}">${esc(s.status)}</span>
        </div>
      </div>
    `).join('');
  } else {
    panel.innerHTML = '<pre class="hermes-output">' + esc(result.output) + '</pre>';
  }
}

/** Парсит `hermes skills list` в массив { name, category, source, trust, status }. */
function parseInstalledSkills(output) {
  const lines = output.split('\n');
  const skills = [];
  for (const line of lines) {
    if (line.includes('─') || line.includes('┌') || line.includes('└') || line.includes('├')) continue;
    const parts = line.split('│').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 4 && parts[0] !== 'Name') {
      const name = parts[0];
      const category = parts[1] || '';
      const source = parts[2] || '—';
      const status = parts[4] || '';
      if (name && name.length < 60 && !name.startsWith('Installed')) {
        skills.push({ name, category, source, status });
      }
    }
  }
  return skills;
}

$('#btn-refresh-hermes').addEventListener('click', () => {
  const activeTab = document.querySelector('.hermes-tab.active');
  if (activeTab) loadHermesData(activeTab.dataset.hermesTab);
});

$('#btn-hermes-sync').addEventListener('click', async () => {
  const btn = $('#btn-hermes-sync');
  btn.disabled = true;
  btn.textContent = '[···] ' + t('hermes_sync');
  const result = await window.aura.hermesSyncToObsidian();
  if (result.ok) {
    btn.textContent = '✓ ' + result.count + ' ' + t('hermes_sync');
    setTimeout(() => { btn.textContent = t('hermes_sync'); btn.disabled = false; }, 3000);
  } else {
    btn.textContent = '✗ ' + (result.error || 'error');
    setTimeout(() => { btn.textContent = t('hermes_sync'); btn.disabled = false; }, 3000);
  }
});

/* ---------- Skills shop ---------- */
async function loadShopResults(source) {
  const panel = $('#shop-results');
  panel.innerHTML = '<div class="hermes-loading">' + esc(t('shop_loading')) + '</div>';

  const res = await window.aura.skillsSearch({ query: '', source: source || 'official' });
  if (!res || !res.ok) {
    panel.innerHTML = '<div class="hermes-error">' + esc(res ? res.output : 'Failed to connect to Hermes') + '</div>';
    return;
  }

  const skills = parseSkillsTable(res.output);
  if (skills.length === 0) {
    panel.innerHTML = '<div class="shop-hint">' + esc(t('shop_empty')) + '</div>';
    return;
  }

  const ins = esc(t('shop_inspect'));
  const inst = esc(t('shop_install'));

  panel.innerHTML = skills.map(s => `
    <div class="shop-card" data-skill-id="${esc(s.id)}">
      <div class="shop-card-head">
        <span class="shop-card-name">${esc(s.name)}</span>
        <span class="shop-card-source pill ${esc(s.source)}">${esc(s.source)}</span>
      </div>
      <div class="shop-card-desc">${esc(s.description || '—')}</div>
      <div class="shop-card-foot">
        <div>
          <button class="btn ghost shop-inspect" data-id="${esc(s.id)}">${ins}</button>
          <button class="btn primary shop-install" data-id="${esc(s.id)}">${inst}</button>
        </div>
      </div>
    </div>
  `).join('');

  panel.querySelectorAll('.shop-inspect').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id;
    const inspect = await window.aura.skillsInspect(id);
    if (inspect && inspect.ok) {
      alert(inspect.output.slice(0, 3000));
    } else {
      alert('Error: ' + (inspect ? inspect.output : 'connection'));
    }
  }));

  panel.querySelectorAll('.shop-install').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id;
    b.disabled = true;
    b.textContent = '⋯';
    const result = await window.aura.skillsInstall(id);
    if (result && result.ok) {
      b.textContent = '[OK]';
      b.classList.remove('primary');
      b.classList.add('ghost');
    } else {
      b.textContent = '✗';
      alert('Error: ' + (result ? result.output : 'connection'));
      setTimeout(() => { b.textContent = inst; b.disabled = false; }, 2000);
    }
  }));
}

function parseSkillsTable(output) {
  const lines = output.split('\n');
  const skills = [];
  for (const line of lines) {
    if (line.includes('─') || line.includes('┌') || line.includes('└') || line.includes('├')) continue;
    const parts = line.split('│').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3 && parts[0] !== 'Name') {
      const name = parts[0];
      const desc = parts[1] || '';
      const source = parts[3] || '—';
      if (name && name.length < 60 && !name.startsWith('Installed') && !name.startsWith('Skills') && !name.startsWith('Searching')) {
        skills.push({ id: name, name, description: desc, source });
      }
    }
  }
  return skills;
}

// Инициализация магазина: загружаем скиллы сразу, кнопка обновляет
$('#btn-shop-refresh').addEventListener('click', () => {
  loadShopResults($('#shop-source').value);
});
$('#shop-source').addEventListener('change', () => {
  loadShopResults($('#shop-source').value);
});

/* ---------- Harness view ---------- */
const PRODUCTION_TEMPLATES = [
  { key: 'audit', mode: 'harness', icon: '🛡', titleRu: 'Security-аудит', titleEn: 'Security audit', textRu: 'Проведи security-аудит проекта в рабочей папке: найди XSS, SQL-инъекции, утечки секретов, обход авторизации. Для каждой находки — файл, строка, серьёзность и как починить. Не выдумывай уязвимостей.', textEn: 'Run a security audit of the project: find XSS, SQL injection, secret leaks, auth bypass. For each: file, line, severity, fix. Do not invent issues.' },
  { key: 'tests', mode: 'loop', icon: '✅', titleRu: 'Зелёные тесты', titleEn: 'Green tests', textRu: 'Добейся, чтобы все тесты в проекте проходили. Найди упавшие, почини, перезапусти — до зелёного.', textEn: 'Make all tests pass. Find failures, fix, re-run until green.', bp: 'npm test' },
  { key: 'deps', mode: 'harness', icon: '📦', titleRu: 'Аудит зависимостей', titleEn: 'Dependency audit', textRu: 'Проверь все зависимости проекта: устаревшие, уязвимые (CVE), неиспользуемые. Для каждой — рекомендация.', textEn: 'Audit all dependencies: outdated, vulnerable (CVE), unused. Recommendation for each.' },
  { key: 'name', mode: 'harness', icon: '🏆', titleRu: 'Нейминг (турнир)', titleEn: 'Naming (tournament)', textRu: 'Придумай имя для нового продукта. Сгенерируй кандидатов разными подходами, отфильтруй по критериям, проведи турнир и выбери 3 лучших с обоснованием.', textEn: 'Pick a product name. Generate candidates via different approaches, filter, run a tournament, pick top 3 with rationale.' },
  { key: 'review', mode: 'harness', icon: '⚖', titleRu: 'Состязательное ревью', titleEn: 'Adversarial review', textRu: 'Проверь код в рабочей папке состязательно: один агент защищает, другой ищет дыры. Выдай список реальных проблем и исправь их.', textEn: 'Adversarially review the code: one defends, one attacks. List real issues and fix them.' },
  { key: 'migrate', mode: 'loop', icon: '🔁', titleRu: 'Миграция до зелёного', titleEn: 'Migration until green', textRu: 'Мигрируй проект на новую версию фреймворка, файл за файлом, прогоняя сборку после каждого шага — до зелёного.', textEn: 'Migrate the project to the new framework version, file by file, building after each step until green.', bp: 'npm run build' }
];

let _proStatusCache = null;

async function loadHarness() {
  // Pro-бейдж в шапке
  const pro = _proStatusCache || (_proStatusCache = await window.aura.pro.status());
  const badge = $('#pro-badge');
  if (badge) {
    badge.className = 'pro-badge ' + (pro.installed && pro.features.length ? 'on' : 'off');
    badge.textContent = (pro.installed && pro.features.length) ? '★ Pro' : 'Free';
  }
  applyI18n();
}

/* dynamic harness */
$('#btn-harness-plan').addEventListener('click', async () => {
  const input = $('#harness-input').value.trim();
  if (!input) return;
  const plan = await window.aura.harness.plan(input);
  const box = $('#harness-plan-box');
  const proTag = plan.proAdvanced ? '<span class="pro-tag">Pro</span>' : '';
  box.innerHTML = `
    <div class="plan-row"><b>${esc(t('harness_tab_dynamic'))}:</b> <span class="pattern-chip">⟳ ${esc(plan.pattern)}</span> ${proTag}</div>
    <div class="plan-reason">${esc(plan.reason)}</div>
    <div class="plan-meta">complexity: ${esc(plan.complexity)} · паттернов доступно: ${plan.availablePatterns.length}${plan.proInstalled ? '' : ' · <i>Pro даёт 6 паттернов</i>'}</div>`;
});

$('#btn-harness-run').addEventListener('click', async () => {
  const input = $('#harness-input').value.trim();
  if (!input) return;
  $('#harness-input').value = '';
  autoGrow($('#harness-input'));
  await window.aura.harness.start(input);
  gotoDashboard();
});

/* ralph loop */
$('#btn-loop-estimate').addEventListener('click', async () => {
  const input = $('#loop-input').value.trim() || 'задача';
  const opts = { maxIterations: parseInt($('#loop-iter').value, 10) || 10 };
  const est = await window.aura.loop.estimate(input, opts);
  $('#loop-cost-note').textContent = `≈ $${est.usd} / ${est.iterations} итер.${est.pro ? ' (' + (est.model || '') + ')' : ' · ' + (est.note || '')}`;
});

$('#btn-loop-run').addEventListener('click', async () => {
  const input = $('#loop-input').value.trim();
  if (!input) return;
  const opts = {
    maxIterations: parseInt($('#loop-iter').value, 10) || 10,
    backpressureCmd: $('#loop-bp').value.trim(),
    autonomy: $('#loop-autonomy').value,
    costCapUsd: parseFloat($('#loop-cap').value) || 0
  };
  $('#loop-input').value = '';
  autoGrow($('#loop-input'));
  await window.aura.loop.start(input, opts);
  gotoDashboard();
});

function gotoDashboard() {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('.nav-btn[data-view="dashboard"]').classList.add('active');
  $('#view-dashboard').classList.add('active');
}

/* templates */
function renderTemplates() {
  const grid = $('#templates-grid');
  grid.innerHTML = PRODUCTION_TEMPLATES.map(tpl => `
    <div class="template-card" data-tpl="${tpl.key}">
      <div class="template-icon">${tpl.icon}</div>
      <div class="template-title">${esc(LANG === 'en' ? tpl.titleEn : tpl.titleRu)}</div>
      <div class="template-mode">${tpl.mode === 'loop' ? 'Ralph Loop' : 'Auto-harness'}</div>
      <button class="btn primary template-use" data-tpl="${tpl.key}">${esc(t('harness_run'))}</button>
    </div>`).join('');
  $$('.template-use').forEach(b => b.addEventListener('click', () => {
    const tpl = PRODUCTION_TEMPLATES.find(x => x.key === b.dataset.tpl);
    const text = LANG === 'en' ? tpl.textEn : tpl.textRu;
    if (tpl.mode === 'loop') {
      $('#loop-input').value = text;
      if (tpl.bp) $('#loop-bp').value = tpl.bp;
      switchHarnessTab('loop');
    } else {
      $('#harness-input').value = text;
      switchHarnessTab('dynamic');
    }
  }));
}

function switchHarnessTab(name) {
  $$('.harness-tab').forEach(t => t.classList.remove('active'));
  $$('.harness-panel').forEach(p => p.classList.remove('active'));
  const tabBtn = document.querySelector(`.harness-tab[data-harness-tab="${name}"]`);
  if (tabBtn) tabBtn.classList.add('active');
  const panel = document.getElementById('harness-' + name);
  if (panel) panel.classList.add('active');
}

/* constraints */
async function loadConstraints() {
  const rules = await window.aura.constraints.list();
  const box = $('#constraints-list');
  if (!rules || rules.length === 0) {
    box.innerHTML = `<div class="empty">${esc(t('memory_empty'))}</div>`;
    return;
  }
  box.innerHTML = rules.map(r => `<div class="constraint-item">— ${esc(r)}</div>`).join('');
}
$('#btn-constraint-add').addEventListener('click', async () => {
  const v = $('#constraint-input').value.trim();
  if (!v) return;
  await window.aura.constraints.add(v);
  $('#constraint-input').value = '';
  loadConstraints();
});
$('#btn-constraint-open').addEventListener('click', () => window.aura.constraints.open());

/* pro status */
async function loadProStatus() {
  const pro = _proStatusCache = await window.aura.pro.status();
  const box = $('#pro-status-box');
  if (pro.installed && pro.features.length) {
    box.innerHTML = `<div class="pro-head on">★ ${esc(t('pro_installed'))} · v${esc(pro.version)}</div>` +
      pro.features.map(f => `<div class="pro-feature"><b>${esc(f.name)}</b><div class="hint">${esc(f.desc)}</div></div>`).join('');
  } else {
    box.innerHTML = `<div class="pro-head off">${esc(t('pro_absent'))}</div><p class="hint">${esc(t('pro_unlock'))}</p>` +
      `<code>npm install git+https://github.com/Ursegorus/aura-pro.git</code>`;
  }
}

/* ---------- Авто-обновление ---------- */
function renderUpdate(s) {
  if (!s) return;
  const elV = $('#update-version'); if (elV) elV.textContent = 'v' + (s.current || '');
  const el = $('#update-status'); const inst = $('#btn-update-install');
  let msg = '', ready = false;
  switch (s.status) {
    case 'checking': msg = t('update_checking'); break;
    case 'available': msg = t('update_available') + ' v' + (s.version || ''); break;
    case 'downloading': msg = t('update_downloading') + ' ' + (s.progress || 0) + '%'; break;
    case 'downloaded': msg = t('update_ready') + ' v' + (s.version || ''); ready = true; break;
    case 'latest': msg = t('update_latest'); break;
    case 'error': msg = t('update_error') + ': ' + (s.error || ''); break;
    case 'portable': msg = t('update_portable'); break;
    case 'dev': msg = t('update_dev'); break;
    default: msg = '';
  }
  if (el) el.textContent = msg;
  if (inst) inst.style.display = ready ? '' : 'none';
  updateBanner(ready ? (t('update_ready') + ' v' + (s.version || '')) : '');
}
function updateBanner(text) {
  let b = document.getElementById('update-banner');
  if (!text) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('div');
    b.id = 'update-banner';
    b.innerHTML = `<span id="update-banner-text"></span>
      <button class="btn primary" id="update-banner-install">${esc(t('update_install'))}</button>
      <button class="btn ghost" id="update-banner-dismiss">✕</button>`;
    document.body.appendChild(b);
    b.querySelector('#update-banner-install').addEventListener('click', () => window.aura.update.install());
    b.querySelector('#update-banner-dismiss').addEventListener('click', () => b.remove());
  }
  b.querySelector('#update-banner-text').textContent = text;
}
if (window.aura.update) {
  window.aura.update.onStatus(renderUpdate);
  $('#btn-update-check').addEventListener('click', () => { window.aura.update.check(); });
  $('#btn-update-install').addEventListener('click', () => window.aura.update.install());
}

/* ---------- init ---------- */
/* ---------- Boot splash ---------- */
(function boot() {
  const overlay = document.getElementById('boot-overlay');
  if (!overlay) return;
  const fill = document.getElementById('boot-bar-fill');
  const status = document.getElementById('boot-status');
  const hint = document.getElementById('boot-hint');
  let hidden = false;
  function apply(s) {
    if (!s) return;
    if (typeof s.pct === 'number' && fill) fill.style.width = Math.max(5, s.pct) + '%';
    if (s.text && status) status.textContent = s.text;
    if (s.done) hide();
  }
  function hide() {
    if (hidden) return; hidden = true;
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 400);
    // подхватить агентов/движки, ставшие доступными после настройки
    loadAgents().catch(() => {});
    loadSettings().catch(() => {});
  }
  // catch-up: состояние могло прийти до подписки
  if (window.aura.setup) {
    window.aura.setup.status().then(apply).catch(() => {});
    window.aura.setup.onProgress(apply);
    window.aura.setup.onDone(hide);
  } else { hide(); }
  // страховка: не держать сплэш дольше 90 c, даже если событие потеряно
  setTimeout(hide, 90000);
})();

(async function init() {
  await loadSettings();
  // Актуальная версия в sidebar
  if (state.settings.version) $('#sidebar-version').textContent = 'v' + state.settings.version;
  await loadAgents();
  state.tasks = await window.aura.task.list();
  // Восстанавливаем логи сохранённых задач, чтобы история открывалась с выводом.
  try {
    const ids = state.tasks.map(t => t.id);
    const logs = await window.aura.task.logs(ids);
    if (logs) Object.assign(state.logs, logs);
  } catch (_) {}
  renderTasks();
  try { if (window.aura.update) renderUpdate(await window.aura.update.get()); } catch (_) {}
})();
