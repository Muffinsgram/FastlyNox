function getWindowBridge() {
  return window.fastcordWindow
    || window.electronAPI?.window
    || window.electronAPI
    || window.desktop?.window
    || window.api?.window;
}

export async function performWindowControl(action) {
  const bridge = getWindowBridge();
  const aliases = {
    minimize: ['minimize', 'minimizeWindow'],
    maximize: ['toggleMaximize', 'maximize', 'maximizeWindow'],
    close: ['close', 'closeWindow'],
  };
  const method = aliases[action]?.find((name) => typeof bridge?.[name] === 'function');
  if (method) {
    await bridge[method]();
    return true;
  }

  const tauriWindow = window.__TAURI__?.window;
  if (tauriWindow?.getCurrentWindow) {
    const current = await tauriWindow.getCurrentWindow();
    if (action === 'minimize' && current.minimize) await current.minimize();
    else if (action === 'maximize' && current.toggleMaximize) await current.toggleMaximize();
    else if (action === 'close' && current.close) await current.close();
    else return false;
    return true;
  }

  if (action === 'maximize') {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    return true;
  }
  if (action === 'close' && window.opener) {
    window.close();
    return true;
  }
  return false;
}
