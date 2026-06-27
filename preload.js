const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aura', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb) => ipcRenderer.on('window:maximized', () => cb(true)),
    onUnmaximized: (cb) => ipcRenderer.on('window:unmaximized', () => cb(false))
  },
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    add: (def) => ipcRenderer.invoke('agents:add', def),
    remove: (id) => ipcRenderer.invoke('agents:remove', id),
    update: (id, patch) => ipcRenderer.invoke('agents:update', { id, patch }),
    toggle: (id, enabled) => ipcRenderer.invoke('agents:toggle', { id, enabled })
  },
  task: {
    start: (input) => ipcRenderer.invoke('task:start', input),
    cancel: (id) => ipcRenderer.invoke('task:cancel', id),
    list: () => ipcRenderer.invoke('task:list'),
    logs: (ids) => ipcRenderer.invoke('task:logs', ids),
    clearHistory: () => ipcRenderer.invoke('task:clearHistory'),
    clarifyAnswer: (taskId, answers) => ipcRenderer.invoke('clarify:answer', { taskId, answers })
  },
  harness: {
    plan: (input) => ipcRenderer.invoke('harness:plan', input),
    start: (input, opts) => ipcRenderer.invoke('harness:start', { input, opts })
  },
  loop: {
    start: (input, opts) => ipcRenderer.invoke('loop:start', { input, opts }),
    stop: (id) => ipcRenderer.invoke('loop:stop', id),
    confirm: (id, go) => ipcRenderer.invoke('loop:confirm', { id, go }),
    estimate: (input, opts) => ipcRenderer.invoke('loop:estimate', { input, opts })
  },
  constraints: {
    list: () => ipcRenderer.invoke('constraints:list'),
    add: (rule) => ipcRenderer.invoke('constraints:add', rule),
    open: () => ipcRenderer.invoke('constraints:open')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    pickFolder: (title) => ipcRenderer.invoke('settings:pickFolder', title),
    pickFile: (title) => ipcRenderer.invoke('settings:pickFile', title)
  },
  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    read: (p) => ipcRenderer.invoke('memory:read', p),
    openVault: () => ipcRenderer.invoke('memory:openVault'),
    getGraphHTML: () => ipcRenderer.invoke('memory:getGraphHTML'),
    getGraph: () => ipcRenderer.invoke('memory:getGraph'),
    auditTemplate: () => ipcRenderer.invoke('memory:auditTemplate'),
    tree: (dir) => ipcRenderer.invoke('memory:tree', dir)
  },
  telegram: {
    restart: () => ipcRenderer.invoke('telegram:restart'),
    onStatus: (cb) => ipcRenderer.on('telegram-status', (_e, data) => cb(data))
  },
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb) => ipcRenderer.on('update:status', (_e, data) => cb(data))
  },
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  setup: {
    status: () => ipcRenderer.invoke('setup:status'),
    onProgress: (cb) => ipcRenderer.on('setup:progress', (_e, data) => cb(data)),
    onDone: (cb) => ipcRenderer.on('setup:done', (_e, data) => cb(data))
  },
  logs: {
    open: () => ipcRenderer.invoke('logs:open'),
    openDir: () => ipcRenderer.invoke('logs:openDir'),
    tail: (n) => ipcRenderer.invoke('logs:tail', n)
  },
  onEvent: (cb) => ipcRenderer.on('aura-event', (_e, data) => cb(data)),
  hermesExec: (opts) => ipcRenderer.invoke('hermes:exec', opts),
  hermesSyncToObsidian: () => ipcRenderer.invoke('hermes:syncToObsidian'),
  skillsSearch: (opts) => ipcRenderer.invoke('skills:search', opts),
  skillsInspect: (id) => ipcRenderer.invoke('skills:inspect', id),
  skillsInstall: (id) => ipcRenderer.invoke('skills:install', id),
  shellOpenExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  agentsInstall: (opts) => ipcRenderer.invoke('agents:install', opts),
  agentsUninstall: (opts) => ipcRenderer.invoke('agents:uninstall', opts),
  hermesStatus: () => ipcRenderer.invoke('hermes:status')
});
