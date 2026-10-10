import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import inputThresholdUrl from './inputThresholdGate.worklet.js?url';

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
        void track.applyConstraints({ ...(track.getConstraints?.() || {}), noiseSuppression: true }).catch(() => {});
        warnFallback();
      };
      // Capture constraints are applied by syncNoiseProcessor so custom
      // processing never resets echo cancellation or automatic gain control.
    } catch (error) {
      if (this.generation !== generation) return;
      await this.destroy();
      await track.applyConstraints({ ...(track.getConstraints?.() || {}), noiseSuppression: true }).catch(() => {});
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

class InputThresholdProcessor {
  name = 'fastlynox-input-threshold';

  constructor(innerProcessor, thresholdDb) {
    this.innerProcessor = innerProcessor;
    const parsedThreshold = Number(thresholdDb);
    this.thresholdDb = Number.isFinite(parsedThreshold) ? Math.max(-100, Math.min(0, parsedThreshold)) : -100;
    this.configurationKey = `input-threshold:${this.thresholdDb}:${innerProcessor?.name || 'standard'}`;
  }

  async init(options) {
    if (!window.AudioWorkletNode || !AudioContext.prototype.audioWorklet) throw new Error('Mikrofon hassasiyet filtresi bu cihazda desteklenmiyor.');
    if (this.innerProcessor) await this.innerProcessor.init(options);
    try {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      await Promise.all([this.context.audioWorklet.addModule(inputThresholdUrl), this.context.resume()]);
      const sourceTrack = this.innerProcessor?.processedTrack || options.track;
      this.source = this.context.createMediaStreamSource(new MediaStream([sourceTrack]));
      this.gate = new AudioWorkletNode(this.context, 'fastlynox-input-threshold', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        parameterData: { thresholdDb: this.thresholdDb },
      });
      this.destination = this.context.createMediaStreamDestination();
      this.source.connect(this.gate).connect(this.destination);
      this.processedTrack = this.destination.stream.getAudioTracks()[0];
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }

  async restart(options) {
    await this.destroy();
    await this.init(options);
  }

  async onPublish(room) {
    if (this.innerProcessor?.onPublish) await this.innerProcessor.onPublish(room);
  }

  async destroy() {
    const { source, gate, destination, context, processedTrack, innerProcessor } = this;
    this.source = this.gate = this.destination = this.context = this.processedTrack = undefined;
    source?.disconnect();
    gate?.disconnect();
    destination?.disconnect();
    processedTrack?.stop();
    if (context && context.state !== 'closed') await context.close().catch(() => {});
    if (innerProcessor) await innerProcessor.destroy();
  }
}

const updates = new WeakMap();
export function syncNoiseProcessor(track, settings) {
  const operation = (updates.get(track) || Promise.resolve()).catch(() => {}).then(async () => {
    if (track.mediaStreamTrack.readyState === 'ended') return;
    const current = track.getProcessor();
    const noiseEnabled = settings.noiseSuppression && settings.noiseProcessor !== 'standard';
    const requestedThreshold = Number(settings.inputSensitivityDb ?? -100);
    const thresholdDb = Number.isFinite(requestedThreshold) ? Math.max(-100, Math.min(0, requestedThreshold)) : -100;
    const thresholdEnabled = thresholdDb > -100;
    const captureTrack = track.mediaStreamTrack;
    const previousConstraints = captureTrack.getConstraints?.() || {};
    const captureConstraints = {
      ...previousConstraints,
      echoCancellation: Boolean(settings.echoCancellation),
      noiseSuppression: noiseEnabled ? false : Boolean(settings.noiseSuppression),
      autoGainControl: true,
      ...(typeof settings.voiceIsolation === 'boolean' ? { voiceIsolation: settings.noiseSuppression ? false : settings.voiceIsolation } : {}),
    };
    try { await captureTrack.applyConstraints(captureConstraints); }
    catch {
      await captureTrack.applyConstraints({
        ...previousConstraints,
        echoCancellation: Boolean(settings.echoCancellation),
        noiseSuppression: noiseEnabled ? false : Boolean(settings.noiseSuppression),
        autoGainControl: true,
      }).catch(() => {});
    }
    if (!noiseEnabled && !thresholdEnabled) {
      if (current?.configurationKey || current?.name === 'fastlynox-rnnoise' || current?.name === 'livekit-noise-filter' || current?.name === 'fastlynox-input-threshold') await track.stopProcessor();
      return;
    }

    let noiseProcessor;
    let noiseName = 'standard';
    if (noiseEnabled && settings.noiseProcessor === 'krisp') {
      try {
        const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
        if (!isKrispNoiseFilterSupported()) throw new Error('Bu cihaz Krisp filtresini desteklemiyor.');
        noiseProcessor = KrispNoiseFilter({ quality: 'high', useBVC: false, bufferOverflowMs: 140, bufferDropMs: 300, onBufferDrop: warnFallback });
        noiseName = noiseProcessor.name;
      } catch (error) {
        console.warn('Krisp etkinleştirilemedi; RNNoise yedeği kullanılıyor.', error);
        window.dispatchEvent(new CustomEvent('fastlynox:noise-fallback', { detail: 'rnnoise' }));
        noiseProcessor = new MicrophoneNoiseProcessor();
        noiseName = noiseProcessor.name;
      }
    } else if (noiseEnabled) {
      noiseProcessor = new MicrophoneNoiseProcessor();
      noiseName = noiseProcessor.name;
    }

    const configurationKey = `${noiseName}:threshold-${thresholdEnabled ? thresholdDb : 'off'}`;
    if (current?.configurationKey === configurationKey) return;
    if (current) await track.stopProcessor();
    if (!thresholdEnabled) {
      await track.setProcessor(noiseProcessor);
      if (noiseName === 'livekit-noise-filter') {
        await noiseProcessor.setEnabled(true);
        window.dispatchEvent(new CustomEvent('fastlynox:noise-quality', { detail: 'krisp' }));
      } else window.dispatchEvent(new CustomEvent('fastlynox:noise-quality', { detail: noiseEnabled ? 'rnnoise' : 'standard' }));
      Object.defineProperty(noiseProcessor, 'configurationKey', { value: configurationKey, configurable: true });
      return;
    }

    const thresholdProcessor = new InputThresholdProcessor(noiseProcessor, thresholdDb);
    thresholdProcessor.configurationKey = configurationKey;
    try {
      await track.setProcessor(thresholdProcessor);
      if (noiseName === 'livekit-noise-filter') await noiseProcessor.setEnabled(true);
      window.dispatchEvent(new CustomEvent('fastlynox:noise-quality', { detail: noiseName === 'standard' ? 'standard' : noiseName === 'livekit-noise-filter' ? 'krisp' : 'rnnoise' }));
    } catch (error) {
      await thresholdProcessor.destroy().catch(() => {});
      window.dispatchEvent(new CustomEvent('fastlynox:input-threshold-fallback', { detail: error instanceof Error ? error.message : '' }));
      if (noiseProcessor) {
        await track.setProcessor(noiseProcessor);
        if (noiseName === 'livekit-noise-filter') await noiseProcessor.setEnabled(true);
        Object.defineProperty(noiseProcessor, 'configurationKey', { value: `${noiseName}:gate-fallback`, configurable: true });
      }
    }
  });
  updates.set(track, operation);
  return operation;
}
