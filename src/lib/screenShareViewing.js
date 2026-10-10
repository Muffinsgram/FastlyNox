export const VIEWING_TOPIC = 'fastlynox:screen-share-view';
export const screenShareKey = (identity, sid) => `screen:${identity}:${sid}`;

export function shouldSubscribeToTrack(source, identity, sid, screenSid, watched) {
  if (source === 'screen_share') return watched.has(screenShareKey(identity, sid));
  if (source === 'screen_share_audio') return Boolean(screenSid && watched.has(screenShareKey(identity, screenSid)));
  return true;
}

export function readViewingMessage(payload) {
  try {
    const message = JSON.parse(new TextDecoder().decode(payload));
    if (message.type !== VIEWING_TOPIC) return null;
    if (message.action === 'request') return { action: 'request' };
    if (message.action !== 'state' || !Array.isArray(message.watched) || message.watched.length > 100) return null;
    if (!message.watched.every(key => typeof key === 'string' && key.startsWith('screen:') && key.length <= 300)) return null;
    return { action: 'state', watched: [...new Set(message.watched)] };
  } catch { return null; }
}

export const microphoneAfterDeafen = (wasEnabled, pushToTalkEnabled) => Boolean(wasEnabled && !pushToTalkEnabled);

export function getShareViewers(participants, publisherId, shareKey, localWatched, remoteViewing) {
  return participants.filter(participant => participant.identity !== publisherId && (participant.isLocal ? localWatched.has(shareKey) : (remoteViewing[participant.identity] || []).includes(shareKey)));
}

export async function changeDeafenState({ participant, deafened, microphoneMemory, pushToTalkEnabled, captureOptions, publishOptions, onChange }) {
  if (!deafened) microphoneMemory.current = participant.isMicrophoneEnabled;
  const enabled = deafened ? microphoneAfterDeafen(microphoneMemory.current, pushToTalkEnabled) : false;
  await participant.setMicrophoneEnabled(enabled, captureOptions, publishOptions);
  onChange(!deafened);
}
