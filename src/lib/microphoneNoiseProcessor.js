import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

let binary;
const warnFallback = () => window.dispatchEvent(new CustomEvent('fastlynox:noise-fallback'));

async function loadBinary() {
  const simd = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
  const url = simd ? simdUrl : wasmUrl;
  // Packaged Electron runs from file://; Fetch does not support file URLs.
  if (new URL(url, window.location.href).protocol === 'file:') {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('GET', url);
      request.responseType = 'arraybuffer';
      request.timeout = 10_000;
      request.onload = () => request.response?.byteLength && (request.status === 0 || request.status === 200) ? resolve(request.response) : reject(new Error('Noise filter asset unavailable'));
      request.onerror = request.ontimeout = () => reject(new Error('Noise filter asset unavailable'));
      request.send();
    });
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Noise filter asset unavailable');
  return response.arrayBuffer();
}

// Each microphone owns its graph. Never connect it to the speaker destination.
export class MicrophoneNoiseProcessor {
  name = 'fastlynox-rnnoise';

  async init({ track }) {
    const generation = this.generation = (this.generation || 0) + 1;
    try {
      this.context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      binary ||= loadBinary().catch(error => { binary = undefined; throw error; });
      const [wasmBinary, , , noiseModule] = await Promise.all([
        binary,
        this.context.audioWorklet.addModule(workletUrl),
        this.context.resume(),
        import('@sapphi-red/web-noise-suppressor'),
      ]);
      if (this.generation !== generation) return;
      if (this.context.state !== 'running') throw new Error('Audio processor suspended');
      this.source = this.context.createMediaStreamSource(new MediaStream([track]));
      this.filter = new noiseModule.RnnoiseWorkletNode(this.context, { wasmBinary, maxChannels: 1 });
      this.destination = this.context.createMediaStreamDestination();
      this.source.connect(this.filter).connect(this.destination);
      this.processedTrack = this.destination.stream.getAudioTracks()[0];
      this.filter.onprocessorerror = () => {
        // Keep speech flowing if the worklet fails after initialization.
        this.source.disconnect();
        this.source.connect(this.destination);
        void track.applyConstraints({ noiseSuppression: true }).catch(() => {});
        warnFallback();
      };
      // Avoid applying two noise filters. Echo cancellation remains enabled.
      await track.applyConstraints({ noiseSuppression: false, voiceIsolation: false }).catch(() => {});
    } catch (error) {
      if (this.generation !== generation) return;
      await this.destroy();
      await track.applyConstraints({ noiseSuppression: true }).catch(() => {});
      console.warn('RNNoise kullanılamadı; standart mikrofon filtresi etkin.', error);
      warnFallback();
    }
  }

  async restart(options) {
    await this.destroy();
    await this.init(options);
  }

  async destroy() {
    this.generation = (this.generation || 0) + 1;
    const { source, filter, destination, context, processedTrack } = this;
    this.source = this.filter = this.destination = this.context = this.processedTrack = undefined;
    source?.disconnect();
    if (filter) {
      filter.onprocessorerror = null;
      filter.disconnect();
      filter.destroy();
    }
    destination?.disconnect();
    processedTrack?.stop();
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }
}

const updates = new WeakMap();
export function syncNoiseProcessor(track, settings) {
  const operation = (updates.get(track) || Promise.resolve()).catch(() => {}).then(async () => {
    if (track.mediaStreamTrack.readyState === 'ended') return;
    const enabled = settings.noiseSuppression && settings.noiseProcessor !== 'standard';
    const current = track.getProcessor();
    if (!enabled) {
      if (current?.name === 'fastlynox-rnnoise' || current?.name === 'livekit-noise-filter') await track.stopProcessor();
      return;
    }
    const target = settings.noiseProcessor === 'krisp' ? 'livekit-noise-filter' : 'fastlynox-rnnoise';
    if (current?.name === target) return;
    if (current) await track.stopProcessor();
    if (target === 'livekit-noise-filter') {
      try {
        const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
        if (!isKrispNoiseFilterSupported()) throw new Error('Bu cihaz Krisp filtresini desteklemiyor.');
        const processor = KrispNoiseFilter({ quality: 'high', useBVC: false, bufferOverflowMs: 140, bufferDropMs: 300, onBufferDrop: warnFallback });
        await track.setProcessor(processor);
        await processor.setEnabled(true);
        window.dispatchEvent(new CustomEvent('fastlynox:noise-quality', { detail: 'krisp' }));
        return;
      } catch (error) {
        console.warn('Krisp etkinleştirilemedi; RNNoise yedeği kullanılıyor.', error);
        window.dispatchEvent(new CustomEvent('fastlynox:noise-fallback', { detail: 'rnnoise' }));
      }
    }
    await track.setProcessor(new MicrophoneNoiseProcessor());
    window.dispatchEvent(new CustomEvent('fastlynox:noise-quality', { detail: 'rnnoise' }));
  });
  updates.set(track, operation);
  return operation;
}
