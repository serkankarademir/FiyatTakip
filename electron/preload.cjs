const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (payload) => ipcRenderer.send('show-notification', payload),
  setRunInBackground: (enabled) => ipcRenderer.send('set-run-in-background', enabled),
  setLaunchAtStartup: (enabled) => ipcRenderer.send('set-launch-at-startup', enabled),
});
