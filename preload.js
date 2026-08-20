const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  hide: () => ipcRenderer.send('overlay:hide'),
  quit: () => ipcRenderer.send('overlay:quit')
});

contextBridge.exposeInMainWorld('masterPlan', {
  publish: plan => ipcRenderer.send('master-plan:update', plan),
  get: () => ipcRenderer.invoke('master-plan:get'),
  onUpdate: callback => ipcRenderer.on('master-plan:update', (_event, plan) => callback(plan)),
  destroyTarget: targetId => ipcRenderer.send('master-plan:destroy-target', String(targetId)),
  onDestroyTarget: callback => ipcRenderer.on('master-plan:destroy-target', (_event, targetId) => callback(targetId))
});
