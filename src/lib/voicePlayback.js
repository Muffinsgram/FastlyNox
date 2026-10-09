export function normalizeVoiceVolume(value) {
  if (value === undefined || value === null || value === '') return 1;
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.max(0, Math.min(2, volume)) : 1;
}

export function getVoicePlayback({ source, participantId, volumes = {}, shareVolumes = {}, mutedShares = {}, deafened = false }) {
  const isScreenAudio = source === 'screen_share_audio';
  const volume = normalizeVoiceVolume((isScreenAudio ? shareVolumes : volumes)[participantId]);
  const muted = Boolean(deafened || (isScreenAudio && mutedShares[participantId]) || volume === 0);
  return { volume: muted ? 0 : volume, muted };
}
