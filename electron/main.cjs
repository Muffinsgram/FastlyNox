const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let lastUpdateStatus = { state: 'idle' };

function publishUpdateStatus(status) {
  lastUpdateStatus = { ...status, checkedAt: Date.now() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('fastlynox:update-status', lastUpdateStatus);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b0e14',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('fastlynox:update-status', lastUpdateStatus);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentOrigin = mainWindow.webContents.getURL().startsWith('http://localhost:')
      ? 'http://localhost:'
      : null;
    if (currentOrigin ? !url.startsWith(currentOrigin) : !url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('fastlynox:window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
  else return false;
  return true;
});

ipcMain.handle('fastlynox:app-version', () => app.getVersion());
ipcMain.handle('fastlynox:check-update', async () => {
  if (!app.isPackaged) return { state: 'development' };
  publishUpdateStatus({ state: 'checking' });
  try {
    await autoUpdater.checkForUpdates();
    return lastUpdateStatus;
  } catch (error) {
    publishUpdateStatus({ state: 'error', message: error?.message || 'Güncelleme kontrol edilemedi.' });
    return lastUpdateStatus;
  }
});
ipcMain.handle('fastlynox:install-update', () => {
  if (!app.isPackaged || lastUpdateStatus.state !== 'downloaded') return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.muffinsgram.fastlynox');
  createWindow();

  if (!app.isPackaged) {
    publishUpdateStatus({ state: 'development' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => publishUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => publishUpdateStatus({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info) => publishUpdateStatus({ state: 'current', version: info.version }));
  autoUpdater.on('download-progress', (progress) => publishUpdateStatus({
    state: 'downloading',
    version: progress.transferred ? lastUpdateStatus.version : undefined,
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
  }));
  autoUpdater.on('update-downloaded', (info) => publishUpdateStatus({ state: 'downloaded', version: info.version }));
  autoUpdater.on('error', (error) => publishUpdateStatus({ state: 'error', message: error?.message || 'Güncelleme kontrol edilemedi.' }));
  setTimeout(() => { void autoUpdater.checkForUpdates(); }, 1800);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
