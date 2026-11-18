'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Only installed in the local settings window. h00k.top never gets a preload.
contextBridge.exposeInMainWorld('h00kDesktop', {
  snapshot: () => ipcRenderer.invoke('desktop:snapshot'),
  setLanguage: language => ipcRenderer.invoke('desktop:set-language', language),
  save: (provider, patch) => ipcRenderer.invoke('desktop:save', provider, patch),
  pick: (provider, id) => ipcRenderer.invoke('desktop:pick', provider, id),
  attach: (provider) => ipcRenderer.invoke('desktop:attach', provider),
  detach: (provider) => ipcRenderer.invoke('desktop:detach', provider),
  openStandalone: () => ipcRenderer.invoke('desktop:standalone'),
  openBrowser: () => ipcRenderer.invoke('desktop:open-browser'),
  onSelectProvider: (callback) => {
    const handler = (_event, provider) => callback(provider);
    ipcRenderer.on('desktop:select-provider', handler);
    return () => ipcRenderer.removeListener('desktop:select-provider', handler);
  },
  onSnapshot: (callback) => {
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('desktop:snapshot-pushed', handler);
    return () => ipcRenderer.removeListener('desktop:snapshot-pushed', handler);
  },
});
