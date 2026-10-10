// Acquire only after a join is requested, alongside network authorization.
// Transfer ownership to the room once taken; every abandoned capture is stopped.
export function prepareMicrophone(createTrack) {
  let disposed = false;
  let taken = false;
  let track;
  const promise = Promise.resolve().then(() => disposed ? null : createTrack()).then(result => {
    if (!result) return null;
    track = result;
    if (disposed) { track.stop(); return null; }
    return track;
  });
  // Permission failure is handled when the connected room takes the capture.
  promise.catch(() => {});
  return {
    async take() {
      if (taken || disposed) return null;
      taken = true;
      return promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (track && !taken) track.stop();
    },
  };
}
