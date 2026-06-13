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

/* ---------- navigation ---------- */
$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + btn.dataset.view).classList.add('active');
  if (btn.dataset.view === 'memory') loadMemory();
  if (btn.dataset.view === 'agents') loadAgents();
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
    return `
    <div class="task-card" data-task="${task.id}">
      <div class="task-head">
        <div class="task-title">${esc(task.input.slice(0, 120))}</div>
        <span class="pill ${stClass}">${esc(t('status_' + task.status.replace(/-/g, '_')))}</span>
      </div>
      ${subtasks ? `<div class="subtask-flow">${subtasks}</div>` : ''}
      <details ${active ? 'open' : ''}>
        <summary>${esc(t('log'))}</summary>
        <div class="task-log" id="log-${task.id}">${esc(log.slice(-12000))}</div>
      </details>
      ${task.summary ? `<div class="task-summary"><b>${esc(t('summary'))}:</b>\n${esc(task.summary)}</div>` : ''}
      <div class="task-actions">
        ${active ? `<button class="btn danger" data-cancel="${task.id}">${esc(t('cancel'))}</button>` : ''}
        <button class="btn ghost" data-open-ws="1">${esc(t('open_workspace'))}</button>
      </div>
    </div>`;
  }).join('');

  $$('[data-cancel]').forEach(b => b.addEventListener('click', () => window.aura.task.cancel(b.dataset.cancel)));
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

async function startTask() {
  const input = $('#task-input').value.trim();
  if (!input) return;
  $('#task-input').value = '';
  await window.aura.task.start(input);
}

$('#btn-run').addEventListener('click', startTask);
$('#task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) startTask();
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
  }
});

/* ---------- agents ---------- */
function agentInitial(name) { return (name || '?').trim()[0].toUpperCase(); }

async function loadAgents() {
  state.agents = await window.aura.agents.list();
  const available = state.agents.filter(a => a.available).length;
  $('#agent-count').textContent = available;
  $('#agents-grid').innerHTML = state.agents.map(a => `
    <div class="agent-card">
      <div class="agent-top">
        <div class="agent-avatar" style="background:${a.color || '#64748b'}">${agentInitial(a.name)}</div>
        <div>
          <div class="agent-name">${esc(a.name)}</div>
          <div class="agent-vendor">${esc(a.vendor || '')}</div>
        </div>
        <span class="agent-status pill ${a.available ? 'completed' : 'failed'}">${a.available ? t('agent_available') : t('agent_missing')}</span>
      </div>
      <div class="skills">${(a.skills || []).map(s => `<span class="skill-tag">${esc(s)}</span>`).join('')}</div>
      <div class="agent-cmd">$ ${esc(a.command)} ${esc((a.args || []).join(' '))}</div>
      <div class="agent-foot">
        <label class="switch"><input type="checkbox" data-toggle="${a.id}" ${a.enabled ? 'checked' : ''}/> ${t('agent_enabled')}</label>
        ${a.builtin ? '' : `<button class="btn danger" data-del="${a.id}">${t('delete')}</button>`}
      </div>
    </div>`).join('');

  $$('[data-toggle]').forEach(el => el.addEventListener('change', () =>
    window.aura.agents.toggle(el.dataset.toggle, el.checked)));
  $$('[data-del]').forEach(el => el.addEventListener('click', async () => {
    await window.aura.agents.remove(el.dataset.del);
    loadAgents();
  }));
  fillCoordinatorSelect();
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
    <div class="memory-item ${state.activeNote === n.path ? 'active' : ''}" data-note="${esc(n.path)}">
      <div>${esc(n.name.replace('.md', ''))}</div>
      <div class="date">${new Date(n.mtime).toLocaleString()}</div>
    </div>`).join('');
  $$('[data-note]').forEach(el => el.addEventListener('click', async () => {
    state.activeNote = el.dataset.note;
    $('#memory-content').textContent = await window.aura.memory.read(el.dataset.note);
    $$('.memory-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
  }));
}
$('#btn-open-vault').addEventListener('click', () => window.aura.memory.openVault());

/* ---------- settings ---------- */
function fillCoordinatorSelect() {
  const sel = $('#set-coordinator');
  sel.innerHTML = state.agents.map(a =>
    `<option value="${a.id}" ${state.settings.coordinator === a.id ? 'selected' : ''}>${esc(a.name)}${a.available ? '' : ' (—)'}</option>`).join('');
}

async function loadSettings() {
  state.settings = await window.aura.settings.get();
  LANG = state.settings.lang || 'ru';
  $('#set-vault').value = state.settings.vaultPath || '';
  $('#set-workspace').value = state.settings.workspace || '';
  $('#set-parallel').value = state.settings.maxParallel;
  $('#set-fix').value = state.settings.maxFixRounds;
  $('#set-review').checked = !!state.settings.reviewEnabled;
  $('#set-routing').checked = !!state.settings.smartRouting;
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

$('#pick-vault').addEventListener('click', async () => {
  const p = await window.aura.settings.pickFolder('Obsidian vault');
  if (p) $('#set-vault').value = p;
});
$('#pick-workspace').addEventListener('click', async () => {
  const p = await window.aura.settings.pickFolder('Workspace');
  if (p) $('#set-workspace').value = p;
});
$('#btn-save-settings').addEventListener('click', async () => {
  const patch = {
    vaultPath: $('#set-vault').value,
    workspace: $('#set-workspace').value,
    coordinator: $('#set-coordinator').value,
    maxParallel: parseInt($('#set-parallel').value, 10) || 3,
    maxFixRounds: parseInt($('#set-fix').value, 10) || 0,
    reviewEnabled: $('#set-review').checked,
    smartRouting: $('#set-routing').checked,
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

/* ---------- init ---------- */
(async function init() {
  await loadSettings();
  await loadAgents();
  state.tasks = await window.aura.task.list();
  renderTasks();
})();
