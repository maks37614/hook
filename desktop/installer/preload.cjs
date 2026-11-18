'use strict';

const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{
  if(typeof callback!=='function')return ()=>{};
  const wrapped=(_event,payload)=>callback(payload);
  ipcRenderer.on(channel,wrapped);
  return ()=>ipcRenderer.removeListener(channel,wrapped);
};
contextBridge.exposeInMainWorld('h00kSetup',Object.freeze({
  initial:()=>ipcRenderer.invoke('setup:initial'),
  browse:()=>ipcRenderer.invoke('setup:browse'),
  start:(options)=>ipcRenderer.invoke('setup:start',options),
  close:()=>ipcRenderer.invoke('setup:close'),
  showGuide:()=>ipcRenderer.invoke('setup:guide'),
  launch:()=>ipcRenderer.invoke('setup:launch'),
  openWebsite:()=>ipcRenderer.invoke('setup:website'),
  onStatus:(callback)=>listen('setup:status',callback),
}));
