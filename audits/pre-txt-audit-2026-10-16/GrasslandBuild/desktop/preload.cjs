'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// API mínima de UI local: sin URLs, archivos, comandos ni wallets.
contextBridge.exposeInMainWorld('grassland', Object.freeze({
  config: () => ipcRenderer.invoke('gf:config'),
  open: id => ipcRenderer.invoke('gf:open', id),
  resume: id => ipcRenderer.invoke('gf:resume', id),
  signOut: () => ipcRenderer.invoke('gf:signout'),
  switchAccount: id => ipcRenderer.invoke('gf:switch', id),
  cancel: () => ipcRenderer.invoke('gf:cancel'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('gf:state', listener);
    return () => ipcRenderer.removeListener('gf:state', listener);
  }
}));
