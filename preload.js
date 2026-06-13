const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aura', {
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
    list: () => ipcRenderer.invoke('task:list')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    pickFolder: (title) => ipcRenderer.invoke('settings:pickFolder', title)
  },
  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    read: (p) => ipcRenderer.invoke('memory:read', p),
    openVault: () => ipcRenderer.invoke('memory:openVault')
  },
  telegram: {
    restart: () => ipcRenderer.invoke('telegram:restart'),
    onStatus: (cb) => ipcRenderer.on('telegram-status', (_e, data) => cb(data))
  },
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  onEvent: (cb) => ipcRenderer.on('aura-event', (_e, data) => cb(data))
});
