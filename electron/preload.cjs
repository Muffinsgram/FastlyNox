const { contextBridge, ipcRenderer } = require('electron');

const windowControl = (action) => ipcRenderer.invoke('fastlynox:window-control', action);
contextBridge.exposeInMainWorld('fastcordWindow', {
  minimize: () => windowControl('minimize'),
  toggleMaximize: () => windowControl('maximize'),
  close: () => windowControl('close'),
  isMaximized: () => ipcRenderer.invoke('fastlynox:is-maximized'),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('fastlynox:window-state', listener);
    return () => ipcRenderer.removeListener('fastlynox:window-state', listener);
  },
});

contextBridge.exposeInMainWorld('fastlynoxDesktop', {
  getVersion: () => ipcRenderer.invoke('fastlynox:app-version'),
  detectGameActivity: () => ipcRenderer.invoke('fastlynox:detect-game-activity'),
  beginSpotifyOAuth: (request) => ipcRenderer.invoke('fastlynox:spotify-oauth-start', request),
  onSpotifyOAuthCallback: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('fastlynox:spotify-oauth-callback', listener);
    return () => ipcRenderer.removeListener('fastlynox:spotify-oauth-callback', listener);
  },
  getAutoStart: () => ipcRenderer.invoke('fastlynox:get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('fastlynox:set-auto-start', Boolean(enabled)),
  checkForUpdates: () => ipcRenderer.invoke('fastlynox:check-update'),
  installUpdate: () => ipcRenderer.invoke('fastlynox:install-update'),
  listScreenSources: () => ipcRenderer.invoke('fastlynox:list-screen-sources'),
  selectScreenSource: (sourceId, withAudio = false) => ipcRenderer.invoke('fastlynox:select-screen-source', sourceId, Boolean(withAudio)),
  onDeepLink: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('fastlynox:deep-link', listener);
    ipcRenderer.send('fastlynox:renderer-ready');
    return () => ipcRenderer.removeListener('fastlynox:deep-link', listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('fastlynox:update-status', listener);
    return () => ipcRenderer.removeListener('fastlynox:update-status', listener);
  },
});
