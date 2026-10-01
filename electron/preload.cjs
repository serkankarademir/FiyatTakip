const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fiyatTakipDesktop', {
  platform: process.platform,
  sendNativeNotification: (payload) => ipcRenderer.invoke('fta:notify', payload),
  setBackgroundMode: (enabled) => ipcRenderer.invoke('fta:set-background-mode', enabled),
  setLaunchAtLogin: (openAtLogin) => ipcRenderer.invoke('fta:set-login-item', openAtLogin),
});
