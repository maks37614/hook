'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// This isolated bridge belongs exclusively to local resize-handle.html.
// No remote h00k.top page gets these methods or the OS cursor coordinates.
contextBridge.exposeInMainWorld('h00kDockResize', Object.freeze({
  start: () => ipcRenderer.send('desktop:dock-resize-start'),
  move: () => ipcRenderer.send('desktop:dock-resize-move'),
  end: () => ipcRenderer.send('desktop:dock-resize-end'),
}));
