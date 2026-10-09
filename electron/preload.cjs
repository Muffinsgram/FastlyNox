const { contextBridge, ipcRenderer } = require('electron');

const windowControl = (action) => ipcRenderer.invoke('fastlynox:window-control', action);
contextBridge.exposeInMainWorld('fastcordWindow', {
  minimize: () => windowControl('minimize'),
  toggleMaximize: () => windowControl('maximize'),
  close: () => windowControl('close'),
});

contextBridge.exposeInMainWorld('fastlynoxDesktop', {
  getVersion: () => ipcRenderer.invoke('fastlynox:app-version'),
  checkForUpdates: () => ipcRenderer.invoke('fastlynox:check-update'),
  installUpdate: () => ipcRenderer.invoke('fastlynox:install-update'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('fastlynox:update-status', listener);
    return () => ipcRenderer.removeListener('fastlynox:update-status', listener);
  },
});
