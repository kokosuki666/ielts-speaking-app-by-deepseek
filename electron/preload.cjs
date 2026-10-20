const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('desktop:info'),
  saveBackup: (json) => ipcRenderer.invoke('backup:save', json),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  // Frameless window: the renderer draws its own title bar.
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (callback) => {
      const handler = (_event, value) => callback(Boolean(value));
      ipcRenderer.on('window:maximized', handler);
      return () => ipcRenderer.removeListener('window:maximized', handler);
    },
  },
});
