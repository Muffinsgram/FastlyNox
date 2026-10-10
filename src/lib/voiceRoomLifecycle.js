// Stop media synchronously; signaling cleanup can finish in the background.
// In particular, disconnect() may wait for the socket before stopping tracks.
export function closeVoiceRoom(room) {
  for (const publication of room.localParticipant.trackPublications.values()) {
    try { publication.track?.stop(); } catch { /* Continue closing other tracks. */ }
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      try { publication.track?.setVolume?.(0); publication.track?.detach(); } catch { /* Continue teardown. */ }
    }
  }
  try { void Promise.resolve(room.disconnect()).catch(() => {}); } catch { /* Media is already stopped. */ }
}
