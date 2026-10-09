const { app, BrowserWindow, ipcMain, shell, Menu, Tray, desktopCapturer, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let splashWindow;
let tray;
let quitting = false;
let startupPending = false;
let startupTimeout;
let selectedScreenSourceId = null;
let selectedScreenShareAudio = false;
let lastUpdateStatus = { state: 'idle' };

function publishUpdateStatus(status) {
  lastUpdateStatus = { ...status, checkedAt: Date.now() };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fastlynox:update-status', lastUpdateStatus);
}

function publishWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fastlynox:window-state', { maximized: mainWindow.isMaximized() });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function handleDeepLink(url) {
  const invite = String(url || '').match(/^fastlynox:\/\/invite\/([a-z0-9_-]{3,32})\/?$/iu)?.[1];
  if (invite) app.pendingInviteCode = invite;
  if (startupPending) return;
  focusMainWindow();
  if (invite && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fastlynox:deep-link', { inviteCode: invite });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 390,
    height: 248,
    resizable: false,
    movable: true,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0d14',
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.setMenuBarVisibility(false);
  splashWindow.once('ready-to-show', () => splashWindow.show());
  splashWindow.on('closed', () => { splashWindow = null; });
  const appLogo = fs.readFileSync(path.join(__dirname, 'app-icon.png')).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;height:100vh;background:radial-gradient(ellipse at 50% 0%,rgba(127,92,255,.2),transparent 60%),#0a0d14;color:#edf0fb;font:13px 'Segoe UI',sans-serif;display:grid;place-items:center;-webkit-app-region:drag}.card{text-align:center}.logo{width:48px;height:48px;margin:auto;filter:drop-shadow(0 0 18px #7e14ff55)}h1{font-size:16px;margin:12px 0 5px;letter-spacing:.02em}p{font-size:11px;color:#8d98ad;margin:0}.line{width:190px;height:3px;border-radius:9px;background:#1a2130;margin:22px auto 0;overflow:hidden}.line:after{content:'';display:block;width:36%;height:100%;border-radius:9px;background:linear-gradient(90deg,#8b5cf6,#55d8e8);animation:move 1.1s ease-in-out infinite alternate}@keyframes move{to{transform:translateX(180%)}}</style></head><body><div class="card"><img class="logo" src="data:image/png;base64,${appLogo}"><h1>Fastlynox</h1><p id="status">Güncellemeler kontrol ediliyor…</p><div class="line"></div></div></body></html>`;
  void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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
    icon: path.join(__dirname, 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('maximize', publishWindowState);
  mainWindow.on('unmaximize', publishWindowState);
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    publishWindowState();
    if (app.pendingInviteCode) {
      mainWindow.webContents.send('fastlynox:deep-link', { inviteCode: app.pendingInviteCode });
      app.pendingInviteCode = null;
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('fastlynox:update-status', lastUpdateStatus);
    publishWindowState();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentOrigin = mainWindow.webContents.getURL().startsWith('http://localhost:') ? 'http://localhost:' : null;
    if (currentOrigin ? !url.startsWith(currentOrigin) : !url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'app-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Fastlynox');
  const refreshMenu = () => tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Fastlynox’ı aç', click: focusMainWindow },
    { type: 'separator' },
    { label: 'Güncellemeleri kontrol et', click: () => { focusMainWindow(); void checkForUpdates(); } },
    { label: 'Uygulamayı yeniden başlat', click: () => restartApp() },
    { type: 'separator' },
    { label: 'Fastlynox’tan çık', click: () => quitApp() },
  ]));
  refreshMenu();
  tray.on('click', focusMainWindow);
  tray.on('double-click', focusMainWindow);
}

function quitApp() {
  quitting = true;
  app.quit();
}

function restartApp() {
  quitting = true;
  app.relaunch();
  app.quit();
}

function setSplashStatus(message) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const escaped = JSON.stringify(String(message));
  void splashWindow.webContents.executeJavaScript(`document.getElementById('status').textContent=${escaped}`).catch(() => {});
}

function finishStartup() {
  if (!startupPending) return;
  startupPending = false;
  clearTimeout(startupTimeout);
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  createWindow();
}

async function checkForUpdates() {
  if (!app.isPackaged) return { state: 'development' };
  publishUpdateStatus({ state: 'checking' });
  try {
    await autoUpdater.checkForUpdates();
    return lastUpdateStatus;
  } catch (error) {
    publishUpdateStatus({ state: 'error', message: error?.message || 'Güncelleme kontrol edilemedi.' });
    return lastUpdateStatus;
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((argument) => argument.startsWith('fastlynox://'));
    if (link) handleDeepLink(link);
    else focusMainWindow();
  });
  app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });
}

ipcMain.handle('fastlynox:window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.hide();
  else return false;
  return true;
});

ipcMain.handle('fastlynox:app-version', () => app.getVersion());
ipcMain.handle('fastlynox:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false);
ipcMain.handle('fastlynox:check-update', checkForUpdates);
ipcMain.handle('fastlynox:install-update', () => {
  if (!app.isPackaged || lastUpdateStatus.state !== 'downloaded') return false;
  quitting = true;
  autoUpdater.quitAndInstall(false, true);
  return true;
});
ipcMain.handle('fastlynox:list-screen-sources', async () => {
  // Source enumeration is on the screen-share critical path; small previews and
  // no per-window icon lookup keep the picker responsive on large desktops.
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 144, height: 81 }, fetchWindowIcons: false });
  return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail?.toDataURL?.() || '' }));
});
ipcMain.handle('fastlynox:select-screen-source', (_event, sourceId, withAudio = false) => {
  selectedScreenSourceId = typeof sourceId === 'string' && sourceId.length < 256 ? sourceId : null;
  selectedScreenShareAudio = Boolean(withAudio);
  return Boolean(selectedScreenSourceId);
});
ipcMain.on('fastlynox:renderer-ready', (event) => {
  if (app.pendingInviteCode) {
    event.sender.send('fastlynox:deep-link', { inviteCode: app.pendingInviteCode });
    app.pendingInviteCode = null;
  }
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  app.setAppUserModelId('com.muffinsgram.fastlynox');
  app.setAsDefaultProtocolClient('fastlynox');
  createTray();
  const initialDeepLink = process.argv.find((argument) => argument.startsWith('fastlynox://'));
  const initialInviteCode = String(initialDeepLink || '').match(/^fastlynox:\/\/invite\/([a-z0-9_-]{3,32})\/?$/iu)?.[1];
  if (initialInviteCode) app.pendingInviteCode = initialInviteCode;
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const requestedId = selectedScreenSourceId;
    const includeAudio = selectedScreenShareAudio && Boolean(request.audioRequested);
    selectedScreenSourceId = null;
    selectedScreenShareAudio = false;
    if (!requestedId) { callback(null); return; }
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 } });
      const source = sources.find((candidate) => candidate.id === requestedId);
      callback(source ? { video: source, ...(includeAudio ? { audio: 'loopback' } : {}) } : null);
    } catch {
      callback(null);
    }
  });

  if (!app.isPackaged) {
    publishUpdateStatus({ state: 'development' });
    createWindow();
    return;
  }

  startupPending = true;
  createSplashWindow();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => { publishUpdateStatus({ state: 'checking' }); setSplashStatus('Güncellemeler kontrol ediliyor…'); });
  autoUpdater.on('update-available', (info) => {
    publishUpdateStatus({ state: 'available', version: info.version });
    setSplashStatus(`${info.version} güncellemesi indiriliyor…`);
    clearTimeout(startupTimeout);
    startupTimeout = setTimeout(() => {
      setSplashStatus('İndirme uzun sürdü. Uygulama açılıyor…');
      finishStartup();
    }, 120_000);
  });
  autoUpdater.on('update-not-available', (info) => { publishUpdateStatus({ state: 'current', version: info.version }); setSplashStatus('Uygulama hazır.'); finishStartup(); });
  autoUpdater.on('download-progress', (progress) => publishUpdateStatus({ state: 'downloading', version: lastUpdateStatus.version, percent: Math.round(progress.percent), transferred: progress.transferred, total: progress.total }));
  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateStatus({ state: 'downloaded', version: info.version });
    setSplashStatus('Güncelleme tamamlandı, yeniden başlatılıyor…');
    quitting = true;
    autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on('error', (error) => {
    publishUpdateStatus({ state: 'error', message: error?.message || 'Güncelleme kontrol edilemedi.' });
    setSplashStatus('Güncelleme kontrol edilemedi. Uygulama açılıyor…');
    finishStartup();
  });
  startupTimeout = setTimeout(() => {
    setSplashStatus('Kontrol biraz uzun sürdü. Uygulama açılıyor…');
    finishStartup();
  }, 20_000);
  void autoUpdater.checkForUpdates().catch(() => {
    setSplashStatus('Güncelleme servisine ulaşılamadı. Uygulama açılıyor…');
    finishStartup();
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && quitting) app.quit();
});
app.on('activate', () => {
  if (!mainWindow && !startupPending) createWindow();
  else focusMainWindow();
});
