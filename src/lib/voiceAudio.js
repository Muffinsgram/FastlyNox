export const DEFAULT_VOICE_AUDIO_SETTINGS = {
  inputDeviceId: '', outputDeviceId: '', audioQuality: 'high', audioQualityVersion: 2,
  echoCancellation: true, noiseSuppression: true, noiseProcessor: 'krisp',
  autoGainControl: true, voiceIsolation: false, inputSensitivityEnabled: false,
  inputSensitivityDb: -100, inputVolume: 100, outputVolume: 100,
};

export function getAudioCaptureOptions(settings = DEFAULT_VOICE_AUDIO_SETTINGS) {
  return {
    ...(settings.inputDeviceId ? { deviceId: { exact: settings.inputDeviceId } } : {}),
    channelCount: 1, sampleRate: 48000, latency: 0.02,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: true,
    voiceIsolation: settings.noiseSuppression && settings.noiseProcessor !== 'standard' ? false : settings.voiceIsolation,
  };
}

export function getAudioPublishOptions(settings = DEFAULT_VOICE_AUDIO_SETTINGS) {
  return {
    audioPreset: { maxBitrate: settings.audioQuality === 'speech' ? 24_000 : 96_000 },
    forceStereo: false, red: true, dtx: settings.audioQuality === 'speech',
    stopMicTrackOnMute: false,
  };
}
