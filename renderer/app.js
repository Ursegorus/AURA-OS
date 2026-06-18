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
}));

/* ---------- Hermes tabs ---------- */
$$('.hermes-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.hermes-tab').forEach(t => t.classList.remove('active'));
  $$('.hermes-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const panel = document.getElementById('hermes-' + tab.dataset.hermesTab);
  if (panel) panel.classList.add('active');
  if (tab.dataset.hermesTab === 'shop') return;
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

async function loadSettings() {
  state.settings = await window.aura.settings.get();
  LANG = state.settings.lang || 'ru';
  $('#set-vault').value = state.settings.vaultPath || '';
  $('#set-workspace').value = state.settings.workspace || '';
  $('#set-parallel').value = state.settings.maxParallel;
  $('#set-fix').value = state.settings.maxFixRounds;
  $('#set-review').checked = !!state.settings.reviewEnabled;
  // Hermes engine
  $('#set-hermes').checked = !!state.settings.useHermesEngine;
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
    maxParallel: parseInt($('#set-parallel').value, 10) || 3,
    maxFixRounds: parseInt($('#set-fix').value, 10) || 0,
    reviewEnabled: $('#set-review').checked,
    useHermesEngine: $('#set-hermes').checked,
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

  panel.innerHTML = '<pre class="hermes-output">' + esc(result.output) + '</pre>';
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
async function loadShopResults(query, source) {
  const panel = $('#shop-results');
  if (!query) { panel.innerHTML = '<div class="shop-hint">Введите поисковый запрос и нажмите «Найти»</div>'; return; }
  panel.innerHTML = '<div class="hermes-loading">Поиск…</div>';

  const res = await window.aura.skillsSearch({ query, source: source || 'all' });
  if (!res || !res.ok) {
    panel.innerHTML = '<div class="hermes-error">' + esc(res ? res.output : 'Ошибка поиска') + '</div>';
    return;
  }

  const skills = parseSkillsTable(res.output);
  if (skills.length === 0) {
    panel.innerHTML = '<div class="shop-hint">Ничего не найдено</div>';
    return;
  }

  panel.innerHTML = skills.map(s => `
    <div class="shop-card" data-skill-id="${esc(s.id)}">
      <div class="shop-card-head">
        <span class="shop-card-name">${esc(s.name)}</span>
        <span class="shop-card-source pill ${esc(s.source)}">${esc(s.source)}</span>
      </div>
      <div class="shop-card-desc">${esc(s.description || '—')}</div>
      <div class="shop-card-foot">
        <span class="shop-card-vendor">${esc(s.vendor || '')}</span>
        <div>
          <button class="btn ghost shop-inspect" data-id="${esc(s.id)}">Описание</button>
          <button class="btn primary shop-install" data-id="${esc(s.id)}">Установить</button>
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
      alert('Ошибка: ' + (inspect ? inspect.output : 'соединение'));
    }
  }));

  panel.querySelectorAll('.shop-install').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id;
    b.disabled = true;
    b.textContent = '⏳';
    const result = await window.aura.skillsInstall(id);
    if (result && result.ok) {
      b.textContent = '✅';
      b.classList.remove('primary');
      b.classList.add('ghost');
    } else {
      b.textContent = '✗';
      alert('Ошибка: ' + (result ? result.output : 'соединение'));
      setTimeout(() => { b.textContent = 'Установить'; b.disabled = false; }, 2000);
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
      if (name && name.length < 60 && !name.startsWith('Installed') && !name.startsWith('Skills')) {
        skills.push({ id: name, name, description: desc, source });
      }
    }
  }
  return skills;
}

$('#btn-shop-search').addEventListener('click', () => {
  loadShopResults($('#shop-query').value.trim(), $('#shop-source').value);
});
$('#shop-query').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadShopResults(e.target.value.trim(), $('#shop-source').value);
  }
});

/* ---------- init ---------- */
(async function init() {
  await loadSettings();
  await loadAgents();
  state.tasks = await window.aura.task.list();
  renderTasks();
})();
