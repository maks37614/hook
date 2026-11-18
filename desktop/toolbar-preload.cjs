'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The privileged bridge exists only in a packaged, local toolbar file.
// h00k.top web content does not get access to the Desktop IPC.
contextBridge.exposeInMainWorld('h00kDockButton', Object.freeze({
  showMenu: () => ipcRenderer.send('desktop:toolbar-menu'),
  openAction: action => {
    if (['docking','metascalp','tiger','vataga','browser'].includes(action))
      ipcRenderer.send('desktop:toolbar-action', action);
  },
  windowControl: action => { if (action==='minimize'||action==='fullscreen'||action==='close') ipcRenderer.send('desktop:toolbar-control',action); },
  toggleEco: () => ipcRenderer.send('desktop:toolbar-eco-toggle'),
  language: () => ipcRenderer.invoke('desktop:toolbar-language'),
  onWindowState: callback => {
    const listener=(_event,state) => callback(state);
    ipcRenderer.on('desktop:toolbar-window-state',listener);
    return () => ipcRenderer.removeListener('desktop:toolbar-window-state',listener);
  },
  onLanguage: callback => {
    const listener=(_event,labels) => callback(labels);
    ipcRenderer.on('desktop:toolbar-language-changed',listener);
    return () => ipcRenderer.removeListener('desktop:toolbar-language-changed',listener);
  },
}));
