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

  if (available === 0) {
    $('#agents-grid').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⬡</div>
        <h3>У вас нет установленных AI-агентов</h3>
        <p class="hint">Нажмите «Установить» рядом с OpenCode — получите бесплатного AI-помощника с открытым кодом. Никаких регистраций и ключей.</p>
        <button class="btn primary" id="btn-install-opencode">+ Установить OpenCode</button>
      </div>`;
    const btn = document.getElementById('btn-install-opencode');
    if (btn) {
      btn.addEventListener('click', async function() {
        this.disabled = true;
        this.textContent = '⋯ Установка...';
        const res = await window.aura.agentsInstall({ command: 'opencode-ai@latest' });
        if (res.ok) {
          this.textContent = '✓ Установлено!'
          setTimeout(() => loadAgents(), 2000);
        } else {
          this.textContent = '✗ Ошибка. Установите Node.js и попробуйте снова.';
        }
      });
    }
    return;
  }

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
        ${!a.available && a.installHint ? `<button class="btn primary btn-install-agent" data-cmd="${esc(a.installHint)}">Установить</button>` : ''}
      </div>
    </div>`).join('');

  $$('[data-toggle]').forEach(el => el.addEventListener('change', () =>
    window.aura.agents.toggle(el.dataset.toggle, el.checked)));
  $$('[data-del]').forEach(el => el.addEventListener('click', async () => {
    await window.aura.agents.remove(el.dataset.del);
    loadAgents();
  }));
  // One-click install
  $$('.btn-install-agent').forEach(el => el.addEventListener('click', async function() {
    const cmd = this.dataset.cmd;
    this.disabled = true;
    this.textContent = '⋯';
    const res = await window.aura.agentsInstall({ command: cmd });
    if (res.ok) {
      this.textContent = '[OK]';
      setTimeout(() => loadAgents(), 2000);
    } else {
      this.textContent = '✗ Ошибка';
      setTimeout(() => { this.textContent = 'Установить'; this.disabled = false; }, 3000);
    }
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
  // Движок
  const mode = state.settings.orchestratorMode || 'auto';
  const hermesOk = state.settings.hermesAvailable;
  const opencodeOk = state.settings.opencodeAvailable;
  $('#set-engine').value = mode;
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
  // AI Free
  $('#set-aifree').checked = !!state.settings.useAIFree;
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
  const panel = $('#hermes-mcp'); // reuse MCP panel? No, create a graph modal
  const html = await window.aura.memory.getGraphHTML();
  // Открываем модальное окно с iframe
  const existing = document.getElementById('graph-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'graph-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:#0b0f17;display:flex;flex-direction:column';
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#0f172a;border-bottom:1px solid #1e293b">
      <span style="color:#e2e8f0;font-weight:600">◎ Граф знаний</span>
      <button id="graph-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer">✕</button>
    </div>
    <iframe id="graph-frame" style="flex:1;border:none" sandbox="allow-scripts"></iframe>`;
  document.body.appendChild(modal);
  document.getElementById('graph-frame').srcdoc = html;
  document.getElementById('graph-close').addEventListener('click', () => modal.remove());
});

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
$('#btn-save-settings').addEventListener('click', async () => {
  const patch = {
    vaultPath: $('#set-vault').value,
    knowledgePath: $('#set-knowledge').value,
    workspace: $('#set-workspace').value,
    maxParallel: parseInt($('#set-parallel').value, 10) || 3,
    maxFixRounds: parseInt($('#set-fix').value, 10) || 0,
    reviewEnabled: $('#set-review').checked,
    orchestratorMode: $('#set-engine').value,
    useHermesEngine: false,
    useAIFree: $('#set-aifree').checked,
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

// AI Free: toggle провайдера при переключении
$('#set-aifree').addEventListener('change', async function() {
  await window.aura.aifreeToggle({ enabled: this.checked });
  const ping = await window.aura.aifreePing();
  if (this.checked && !ping.ok) {
    alert('AI Free API не отвечает на localhost:4318.\nЗапустите npm run api в папке ai-free.');
  }
});

// Ссылка на репозиторий AI Free
$('#aifree-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.aura.shellOpenExternal('https://github.com/Staks-sor/ai-free');
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

/* ---------- init ---------- */
(async function init() {
  await loadSettings();
  // Актуальная версия в sidebar
  if (state.settings.version) $('#sidebar-version').textContent = 'v' + state.settings.version;
  await loadAgents();
  state.tasks = await window.aura.task.list();
  renderTasks();
})();
