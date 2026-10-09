export function supportsOwnAudioExclusion() {
  return globalThis.navigator?.mediaDevices?.getSupportedConstraints?.().restrictOwnAudio === true;
}

export function getScreenShareCaptureOptions(settings = {}) {
  const quality = String(settings.quality);
  const [width, height] = quality === '720' ? [1280, 720] : quality === '1440' ? [2560, 1440] : [1920, 1080];
  const frameRate = [15, 30, 60].includes(Number(settings.frameRate)) ? Number(settings.frameRate) : 30;
  return {
    video: true,
    // Electron 44 excludes this application's process tree from loopback capture.
    audio: settings.audio && supportsOwnAudioExclusion() ? { restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    systemAudio: settings.audio && supportsOwnAudioExclusion() ? 'include' : 'exclude',
    selfBrowserSurface: 'exclude',
    resolution: { width, height, frameRate },
    contentHint: frameRate === 60 ? 'motion' : 'detail',
  };
}

export function getScreenSharePublishOptions(settings = {}) {
  const { resolution } = getScreenShareCaptureOptions(settings);
  const bitrate = resolution.height === 720 ? 3_000_000 : resolution.height === 1440 ? 10_000_000 : 6_000_000;
  return {
    screenShareEncoding: { maxBitrate: Math.round(bitrate * (resolution.frameRate === 60 ? 1.6 : resolution.frameRate === 15 ? 0.7 : 1)), maxFramerate: resolution.frameRate },
    // A single stream avoids subscribers getting the SDK's low-FPS screen layer.
    simulcast: false,
    degradationPreference: resolution.frameRate === 60 ? 'maintain-framerate' : 'balanced',
    audioPreset: { maxBitrate: 128_000 },
    dtx: false,
  };
}
