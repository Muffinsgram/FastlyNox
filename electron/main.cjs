const { app, BrowserWindow, ipcMain, shell, Menu, Tray, desktopCapturer, session, globalShortcut, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { autoUpdater } = require('electron-updater');
const { isExternalLink } = require('./externalLinks.cjs');

const APP_USER_MODEL_ID = 'com.muffinsgram.fastlynox';
const TOAST_ACTIVATOR_CLSID = '{8D1E13D7-65F8-4F23-91B0-7F3D56D341A2}';

let mainWindow;
let splashWindow;
let tray;
let quitting = false;
let startupPending = false;
let startupTimeout;
let selectedScreenSourceId = null;
let spotifyOAuthServer;
const startupPreferencePath = () => path.join(app.getPath('userData'), 'startup-preference.json');
const startupShortcutPath = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Fastlynox.lnk');
const loginItemOptions = () => ({ path: process.execPath, args: [] });
function hasStartupShortcut() {
  if (process.platform !== 'win32') return false;
  try { return path.resolve(shell.readShortcutLink(startupShortcutPath()).target) === path.resolve(process.execPath); }
  catch { return false; }
}
function isAutoStartEnabled() {
  if (!app.isPackaged) return false;
  try { if (app.getLoginItemSettings(loginItemOptions()).openAtLogin) return true; }
  catch { /* Fall back to the per-user Startup folder shortcut. */ }
  return hasStartupShortcut();
}
function applyAutoStart(enabled) {
  if (!app.isPackaged || typeof enabled !== 'boolean') return false;
  let registered = false;
  try {
    app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: enabled });
    registered = app.getLoginItemSettings(loginItemOptions()).openAtLogin === enabled;
  }
  catch (error) { console.warn('Windows oturum açılışı kaydı ayarlanamadı; başlangıç kısayolu deneniyor.', error); }
  if (process.platform === 'win32') {
    try {
      if (enabled && !registered && !hasStartupShortcut()) {
        fs.mkdirSync(path.dirname(startupShortcutPath()), { recursive: true });
        const shortcut = { target: process.execPath, args: [], description: 'Fastlynox bilgisayar açılışında başlat' };
        const operation = fs.existsSync(startupShortcutPath()) ? 'replace' : 'create';
        if (shell.writeShortcutLink(startupShortcutPath(), operation, shortcut) === false) return false;
      } else if (!enabled && fs.existsSync(startupShortcutPath())) {
        fs.rmSync(startupShortcutPath());
      }
    } catch (error) {
      console.warn('Windows başlangıç kısayolu ayarlanamadı.', error);
    }
  }
  const applied = isAutoStartEnabled() === enabled;
  if (applied) {
    try {
      fs.mkdirSync(path.dirname(startupPreferencePath()), { recursive: true });
      fs.writeFileSync(startupPreferencePath(), JSON.stringify({ enabled }), 'utf8');
    } catch (error) { console.warn('Otomatik başlatma tercihi kaydedilemedi.', error); }
  }
  return applied;
}
let selectedScreenShareAudio = false;
let lastUpdateStatus = { state: 'idle' };
let voiceHotkeysEnabled = false;
let voiceKeybinds = { toggleMicrophone: '', toggleDeafen: '', pushToTalk: '' };
const registeredVoiceHotkeys = new Set();
let nativeInputHook;
let nativeInputKeys;
let nativeInputHookReady = false;
let nativeInputHookActive = false;
let mainWindowBlurred = false;
const nativeHeldKeys = new Set();
const activeBackgroundVoiceBindings = new Map();

function sendVoiceHotkey(action, phase = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('fastlynox:voice-hotkey', phase ? { action, phase } : action);
}

function nativeKeyNameFromCode(code) {
  const special = {
    Space: 'Space', Enter: 'Enter', NumpadEnter: 'NumpadEnter', Escape: 'Escape', Backspace: 'Backspace',
    CapsLock: 'CapsLock', NumLock: 'NumLock', ScrollLock: 'ScrollLock', PrintScreen: 'PrintScreen',
    Tab: 'Tab', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Minus: 'Minus', Equal: 'Equal', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight', Backslash: 'Backslash',
    Semicolon: 'Semicolon', Quote: 'Quote', Backquote: 'Backquote', Comma: 'Comma', Period: 'Period', Slash: 'Slash',
    NumpadMultiply: 'NumpadMultiply', NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSubtract',
    NumpadDecimal: 'NumpadDecimal', NumpadDivide: 'NumpadDivide',
    ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', AltLeft: 'Alt', AltRight: 'AltRight',
    ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', MetaLeft: 'Meta', MetaRight: 'MetaRight',
    Ctrl: 'Ctrl', CtrlRight: 'CtrlRight', Alt: 'Alt',
    Shift: 'Shift', Meta: 'Meta', AltGraph: 'AltRight',
  };
  if (special[code]) return special[code];
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/u.test(code)) return code;
  if (/^Numpad(?:Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Insert|Delete)$/u.test(code)) return code;
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/u.test(code)) return code;
  return '';
}

function parseGlobalVoiceBinding(binding) {
  if (typeof binding !== 'string' || !binding) return null;
  const parts = binding.split('+');
  const code = parts.pop();
  const modifiers = new Set(parts);
  const modifierKeycodes = [...modifiers]
    .map((modifier) => nativeInputKeys?.[modifier === 'AltGraph' ? 'AltRight' : modifier])
    .filter(Number.isFinite);
  if (code === 'Mouse4' || code === 'Mouse5') return { code, modifiers, modifierKeycodes };
  const keyName = nativeKeyNameFromCode(code);
  const keycode = keyName ? nativeInputKeys?.[keyName] : null;
  return Number.isFinite(keycode) ? { code, keycode, modifiers, modifierKeycodes } : null;
}

function eventHasBindingModifiers(event, binding) {
  const codeIsModifier = /^(?:Control|Ctrl|Alt|Shift|Meta)/u.test(binding.code);
  if (codeIsModifier) return binding.modifiers.size === 0 && event.keycode === binding.keycode;
  const keycode = (name) => nativeInputKeys?.[name];
  const rightCtrlHeld = nativeHeldKeys.has(keycode('CtrlRight'));
  const leftCtrlHeld = nativeHeldKeys.has(keycode('Ctrl'));
  const rightAltHeld = nativeHeldKeys.has(keycode('AltRight'));
  const leftAltHeld = nativeHeldKeys.has(keycode('Alt'));
  const altGraphCtrl = event.ctrlKey && rightAltHeld && !rightCtrlHeld && !leftCtrlHeld;
  const expected = {
    Ctrl: binding.modifiers.has('Ctrl') || binding.modifiers.has('CtrlRight') || /^(?:Control|Ctrl)/u.test(binding.code),
    Alt: binding.modifiers.has('Alt') || binding.modifiers.has('AltRight') || binding.modifiers.has('AltGraph') || /^Alt/u.test(binding.code),
    Shift: binding.modifiers.has('Shift') || binding.modifiers.has('ShiftRight') || /^Shift/u.test(binding.code),
    Meta: binding.modifiers.has('Meta') || binding.modifiers.has('MetaRight') || /^Meta/u.test(binding.code),
  };
  if ((event.ctrlKey && !expected.Ctrl && !altGraphCtrl) || (!event.ctrlKey && expected.Ctrl)) return false;
  if (event.altKey !== expected.Alt || event.shiftKey !== expected.Shift || event.metaKey !== expected.Meta) return false;
  if (binding.modifiers.has('CtrlRight') && !rightCtrlHeld) return false;
  if (binding.modifiers.has('AltRight') && !rightAltHeld) return false;
  if (binding.modifiers.has('Ctrl') && !rightCtrlHeld && !leftCtrlHeld) return false;
  if (binding.modifiers.has('Alt') && !rightAltHeld && !leftAltHeld) return false;
  return true;
}

function eventMatchesGlobalVoiceBinding(event, binding) {
  if (!binding || !eventHasBindingModifiers(event, binding)) return false;
  if (binding.code === 'Mouse4' || binding.code === 'Mouse5') {
    const button = Number(event.button);
    return (binding.code === 'Mouse4' && button === 4) || (binding.code === 'Mouse5' && button === 5);
  }
  return event.keycode === binding.keycode;
}

function eventReleasesGlobalVoiceBinding(event, binding, inputType) {
  if (binding.code === 'Mouse4' || binding.code === 'Mouse5') {
    if (inputType !== 'mouse') return false;
    const button = Number(event.button);
    return (binding.code === 'Mouse4' && button === 4) || (binding.code === 'Mouse5' && button === 5);
  }
  return inputType === 'keyboard'
    && (event.keycode === binding.keycode || binding.modifierKeycodes.includes(event.keycode));
}

function handleBackgroundVoiceInput(event, phase, inputType) {
  if (!voiceHotkeysEnabled || !nativeInputHookActive || !mainWindowBlurred || !mainWindow || mainWindow.isDestroyed()) return;
  if (phase === 'up') {
    for (const [action, activeBinding] of activeBackgroundVoiceBindings) {
      if (!eventReleasesGlobalVoiceBinding(event, activeBinding, inputType)) continue;
      activeBackgroundVoiceBindings.delete(action);
      if (action === 'pushToTalk') sendVoiceHotkey(action, 'up');
    }
    if (inputType === 'keyboard') nativeHeldKeys.delete(event.keycode);
    return;
  }
  if (inputType === 'keyboard') nativeHeldKeys.add(event.keycode);
  for (const action of ['toggleMicrophone', 'toggleDeafen', 'pushToTalk']) {
    const binding = parseGlobalVoiceBinding(voiceKeybinds[action]);
    if (!binding || activeBackgroundVoiceBindings.has(action)) continue;
    const accelerator = toElectronAccelerator(voiceKeybinds[action]);
    // Electron's native shortcut owns successful keyboard bindings. The low-level
    // hook fills the gaps (push-to-talk, mouse buttons, and unsupported keys).
    if (action !== 'pushToTalk' && accelerator && registeredVoiceHotkeys.has(accelerator)) continue;
    if ((inputType === 'mouse') !== (binding.code === 'Mouse4' || binding.code === 'Mouse5')) continue;
    if (!eventMatchesGlobalVoiceBinding(event, binding)) continue;
    activeBackgroundVoiceBindings.set(action, binding);
    if (action === 'pushToTalk') sendVoiceHotkey(action, 'down');
    else sendVoiceHotkey(action);
  }
}

function startBackgroundVoiceInput() {
  if (!voiceHotkeysEnabled || nativeInputHookActive || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (!nativeInputHookReady) {
      const hook = require('uiohook-napi');
      nativeInputHook = hook.uIOhook;
      nativeInputKeys = hook.UiohookKey;
      nativeInputHook.on('keydown', (event) => handleBackgroundVoiceInput(event, 'down', 'keyboard'));
      nativeInputHook.on('keyup', (event) => handleBackgroundVoiceInput(event, 'up', 'keyboard'));
      nativeInputHook.on('mousedown', (event) => handleBackgroundVoiceInput(event, 'down', 'mouse'));
      nativeInputHook.on('mouseup', (event) => handleBackgroundVoiceInput(event, 'up', 'mouse'));
      nativeInputHookReady = true;
    }
    nativeInputHook.start();
    nativeInputHookActive = true;
  } catch (error) {
    console.warn('Arka plan bas-konuş kısayolu başlatılamadı.', error);
  }
}

function stopBackgroundVoiceInput() {
  if (nativeInputHookActive) {
    try { nativeInputHook.stop(); } catch { /* Hook may already be stopping. */ }
  }
  nativeInputHookActive = false;
  nativeHeldKeys.clear();
  if (activeBackgroundVoiceBindings.has('pushToTalk')) sendVoiceHotkey('pushToTalk', 'up');
  activeBackgroundVoiceBindings.clear();
}

function releaseBackgroundVoiceInputs() {
  if (activeBackgroundVoiceBindings.has('pushToTalk')) sendVoiceHotkey('pushToTalk', 'up');
  activeBackgroundVoiceBindings.clear();
  nativeHeldKeys.clear();
}

function toElectronAccelerator(binding) {
  if (typeof binding !== 'string' || !binding || binding.includes('Mouse')) return '';
  const parts = binding.split('+');
  const code = parts.pop();
  const keyNames = {
    Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Backspace: 'Backspace',
    Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
    Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  };
  let key = keyNames[code];
  if (!key && /^Key[A-Z]$/u.test(code)) key = code.slice(3);
  if (!key && /^Digit[0-9]$/u.test(code)) key = code.slice(5);
  if (!key && /^F(?:[1-9]|1[0-9]|2[0-4])$/u.test(code)) key = code;
  if (!key) return '';
  const modifiers = [];
  for (const part of parts) {
    if (part === 'Ctrl') modifiers.push('Control');
    else if (part === 'Alt' || part === 'AltRight' || part === 'AltGraph') modifiers.push('Alt');
    else if (part === 'Shift') modifiers.push('Shift');
    else if (part === 'Meta') modifiers.push('Super');
    else return '';
  }
  // Unmodified letters would steal ordinary typing from other applications.
  if (!modifiers.length) return '';
  return [...new Set(modifiers), key].join('+');
}

function refreshVoiceHotkeys() {
  for (const accelerator of registeredVoiceHotkeys) globalShortcut.unregister(accelerator);
  registeredVoiceHotkeys.clear();
  if (!voiceHotkeysEnabled) return { success: true, bindings: {} };
  let allRegistered = true;
  const registeredBindings = {};
  for (const action of ['toggleMicrophone', 'toggleDeafen']) {
    const requested = toElectronAccelerator(voiceKeybinds[action]);
    if (!voiceKeybinds[action]) continue;
    if (!requested) {
      allRegistered = false;
      continue;
    }
    const registered = globalShortcut.register(requested, () => {
      // Let the renderer decide whether the app is focused. Windows can report
      // a stale BrowserWindow focus state around minimize/restore transitions.
      sendVoiceHotkey(action);
    });
    if (registered) {
      registeredBindings[action] = requested;
      registeredVoiceHotkeys.add(requested);
    } else allRegistered = false;
  }
  if (voiceHotkeysEnabled) startBackgroundVoiceInput();
  else stopBackgroundVoiceInput();
  return { success: allRegistered, bindings: registeredBindings };
}

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
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('blur', () => { mainWindowBlurred = true; startBackgroundVoiceInput(); });
  mainWindow.on('focus', () => { mainWindowBlurred = false; releaseBackgroundVoiceInputs(); });

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
    if (isExternalLink(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentOrigin = mainWindow.webContents.getURL().startsWith('http://localhost:') ? 'http://localhost:' : null;
    if (currentOrigin ? !url.startsWith(currentOrigin) : !url.startsWith('file://')) {
      event.preventDefault();
      if (isExternalLink(url)) void shell.openExternal(url);
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
    { label: 'Hakkında', submenu: [
      { label: `Fastlynox · Sürüm ${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: 'Fastlynox web sitesini aç', click: () => { void shell.openExternal('https://fastlynox.vercel.app'); } },
      { label: 'Sürümleri görüntüle', click: () => { void shell.openExternal('https://github.com/Muffinsgram/FastlyNox/releases/latest'); } },
    ] },
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

function setSplashProgress(percent) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  void splashWindow.webContents.executeJavaScript(`(()=>{const line=document.querySelector('.line');if(!line)return;if(!document.getElementById('splash-progress-style')){const style=document.createElement('style');style.id='splash-progress-style';style.textContent='.line.determinate:after{width:var(--progress,0%);animation:none}';document.head.append(style)}line.classList.add('determinate');line.style.setProperty('--progress',${JSON.stringify(`${value}%`)})})()`).catch(() => {});
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

ipcMain.handle('fastlynox:set-voice-keybinds', (event, bindings = {}) => {
  if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return false;
  voiceKeybinds = {
    toggleMicrophone: typeof bindings.toggleMicrophone === 'string' ? bindings.toggleMicrophone.slice(0, 80) : '',
    toggleDeafen: typeof bindings.toggleDeafen === 'string' ? bindings.toggleDeafen.slice(0, 80) : '',
    pushToTalk: typeof bindings.pushToTalk === 'string' ? bindings.pushToTalk.slice(0, 80) : '',
  };
  return refreshVoiceHotkeys();
});
ipcMain.handle('fastlynox:set-voice-hotkeys-enabled', (event, enabled) => {
  if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return false;
  voiceHotkeysEnabled = Boolean(enabled);
  return refreshVoiceHotkeys();
});

ipcMain.handle('fastlynox:app-version', () => app.getVersion());
ipcMain.handle('fastlynox:show-notification', (event, options = {}) => {
  if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return false;
  if (!Notification.isSupported()) {
    console.warn('Bu sistemde yerel masaüstü bildirimi desteklenmiyor.');
    return false;
  }
  const title = typeof options.title === 'string' ? options.title.trim().slice(0, 120) : '';
  const body = typeof options.body === 'string' ? options.body.trim().slice(0, 300) : '';
  if (!title && !body) return false;
  try {
    const notification = new Notification({
      title: title || 'Fastlynox',
      body,
      icon: path.join(__dirname, 'app-icon.ico'),
      silent: false,
      timeoutType: 'default',
    });
    notification.on('failed', (_event, error) => console.warn('Windows bildirimi gösterilemedi:', error));
    notification.show();
    return true;
  } catch (error) {
    console.warn('Windows bildirimi oluşturulamadı:', error);
    return false;
  }
});
ipcMain.handle('fastlynox:spotify-oauth-start', async (_event, request = {}) => {
  const { clientId, state, codeChallenge } = request;
  if (!/^[a-zA-Z0-9]{20,80}$/u.test(clientId || '') || !/^[a-zA-Z0-9_-]{40,64}$/u.test(state || '') || !/^[a-zA-Z0-9_-]{40,64}$/u.test(codeChallenge || '')) return null;
  if (spotifyOAuthServer) { try { spotifyOAuthServer.close(); } catch { /* An earlier login flow has already ended. */ } }
  return new Promise((resolve) => {
    let completed = false;
    let server;
    const finish = (result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      if (spotifyOAuthServer === server) spotifyOAuthServer = null;
      try { server?.close(); } catch { /* Socket already closed. */ }
      resolve(result);
    };
    server = http.createServer((requestMessage, response) => {
      const callback = new URL(requestMessage.url || '/', 'http://127.0.0.1');
      if (requestMessage.method !== 'GET' || callback.pathname !== '/spotify-callback') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      const code = callback.searchParams.get('code');
      const returnedState = callback.searchParams.get('state');
      const denied = callback.searchParams.get('error');
      const valid = returnedState === state && Boolean(code) && !denied;
      response.writeHead(valid ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(`<!doctype html><meta charset="utf-8"><title>Fastlynox</title><body style="background:#0b0e14;color:#e7eaf4;font:16px Segoe UI,sans-serif;display:grid;place-items:center;height:90vh"><p>${valid ? 'Spotify bağlandı. Bu pencereyi kapatıp Fastlynox’a dönebilirsin.' : 'Spotify bağlantısı tamamlanamadı. Fastlynox’a dönüp yeniden dene.'}</p></body>`);
      if (returnedState === state && (code || denied) && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fastlynox:spotify-oauth-callback', { code, state: returnedState, error: denied || '' });
      finish(null);
    });
    spotifyOAuthServer = server;
    const timeout = setTimeout(() => finish(null), 5 * 60_000);
    server.once('error', () => finish(null));
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') { finish(null); return; }
      const redirectUri = `http://127.0.0.1:${address.port}/spotify-callback`;
      const authorizationUrl = new URL('https://accounts.spotify.com/authorize');
      authorizationUrl.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, code_challenge_method: 'S256', code_challenge: codeChallenge, state, scope: 'user-read-currently-playing' }).toString();
      try { await shell.openExternal(authorizationUrl.toString()); resolve({ redirectUri }); }
      catch { finish(null); }
    });
  });
});
ipcMain.handle('fastlynox:detect-game-activity', async () => {
  if (process.platform !== 'win32') return null;
  const knownGames = new Map([
    ['valorant-win64-shipping.exe', { title: 'VALORANT', details: 'Oynuyor' }],
    ['league of legends.exe', { title: 'League of Legends', details: 'Oynuyor' }],
    ['overwatch.exe', { title: 'Overwatch 2', details: 'Oynuyor', steamAppId: '2357570' }],
    ['fortniteclient-win64-shipping.exe', { title: 'Fortnite', details: 'Oynuyor' }],
    ['cs2.exe', { title: 'Counter-Strike 2', details: 'Oynuyor', steamAppId: '730' }],
    ['minecraft.exe', { title: 'Minecraft', details: 'Oynuyor' }],
    ['robloxplayerbeta.exe', { title: 'Roblox', details: 'Oynuyor' }],
    ['rocketleague.exe', { title: 'Rocket League', details: 'Oynuyor', steamAppId: '252950' }],
    ['gta5.exe', { title: 'Grand Theft Auto V', details: 'Oynuyor', steamAppId: '271590' }],
    ['apex_legends.exe', { title: 'Apex Legends', details: 'Oynuyor', steamAppId: '1172470' }],
    ['tslgame.exe', { title: 'PUBG: BATTLEGROUNDS', details: 'Oynuyor', steamAppId: '578080' }],
    ['dota2.exe', { title: 'Dota 2', details: 'Oynuyor', steamAppId: '570' }],
    ['rainbowsix.exe', { title: 'Tom Clancy’s Rainbow Six Siege', details: 'Oynuyor', steamAppId: '359550' }],
    ['deadbydaylight-win64-shipping.exe', { title: 'Dead by Daylight', details: 'Oynuyor', steamAppId: '381210' }],
    ['genshinimpact.exe', { title: 'Genshin Impact', details: 'Oynuyor' }],
    ['starrail.exe', { title: 'Honkai: Star Rail', details: 'Oynuyor' }],
    ['destiny2.exe', { title: 'Destiny 2', details: 'Oynuyor', steamAppId: '1085660' }],
    ['among us.exe', { title: 'Among Us', details: 'Oynuyor', steamAppId: '945360' }],
    ['terraria.exe', { title: 'Terraria', details: 'Oynuyor', steamAppId: '105600' }],
    ['eldenring.exe', { title: 'Elden Ring', details: 'Oynuyor', steamAppId: '1245620' }],
    ['palworld-win64-shipping.exe', { title: 'Palworld', details: 'Oynuyor', steamAppId: '1623730' }],
    ['stardew valley.exe', { title: 'Stardew Valley', details: 'Oynuyor', steamAppId: '413150' }],
  ]);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 4000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error || typeof stdout !== 'string') { resolve(null); return; }
      const running = new Set([...stdout.matchAll(/^\s*"([^"]+)"/gmu)].map((match) => match[1].toLowerCase()));
      const game = [...knownGames].find(([processName]) => running.has(processName));
      resolve(game ? { ...game[1], processName: game[0] } : null);
    });
  });
});
ipcMain.handle('fastlynox:get-auto-start', () => isAutoStartEnabled());
ipcMain.handle('fastlynox:set-auto-start', (_event, enabled) => applyAutoStart(enabled));
ipcMain.handle('fastlynox:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false);
ipcMain.handle('fastlynox:check-update', checkForUpdates);
ipcMain.handle('fastlynox:install-update', () => {
  if (!app.isPackaged || lastUpdateStatus.state !== 'downloaded') return false;
  quitting = true;
  autoUpdater.quitAndInstall(true, true);
  return true;
});
ipcMain.handle('fastlynox:list-screen-sources', async () => {
  // Source enumeration is on the screen-share critical path; small previews and
  // no per-window icon lookup keep the picker responsive on large desktops.
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 144, height: 81 }, fetchWindowIcons: false });
  return sources.map((source) => ({ id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: source.thumbnail?.toDataURL?.() || '' }));
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
  app.setAppUserModelId(APP_USER_MODEL_ID);
  if (process.platform === 'win32') app.setToastActivatorCLSID(TOAST_ACTIVATOR_CLSID);
  if (app.isPackaged) {
    let startupPreference;
    try { startupPreference = JSON.parse(fs.readFileSync(startupPreferencePath(), 'utf8')).enabled; } catch { startupPreference = true; }
    if (!applyAutoStart(startupPreference !== false)) console.warn('Otomatik başlatma kaydı bu Windows hesabına uygulanamadı.');
  }
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
  // Keep NSIS blockmap updates enabled so only changed installer blocks download.
  autoUpdater.disableDifferentialDownload = false;
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
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    const bytesPerSecond = Math.max(0, Number(progress.bytesPerSecond) || 0);
    publishUpdateStatus({ state: 'downloading', version: lastUpdateStatus.version, percent, transferred: progress.transferred, total: progress.total, bytesPerSecond });
    setSplashProgress(percent);
    setSplashStatus(`Güncelleme indiriliyor · %${percent} · ${Math.round(bytesPerSecond / 1024)} KB/sn`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateStatus({ state: 'downloaded', version: info.version });
    setSplashStatus('Güncelleme tamamlandı, yeniden başlatılıyor…');
    quitting = true;
    autoUpdater.quitAndInstall(true, true);
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

app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && quitting) app.quit();
});
app.on('activate', () => {
  if (!mainWindow && !startupPending) createWindow();
  else focusMainWindow();
});
