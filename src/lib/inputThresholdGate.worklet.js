class FastlynoxInputThreshold extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'thresholdDb', defaultValue: -100, minValue: -100, maxValue: 0, automationRate: 'k-rate' }];
  }

  constructor(options) {
    super();
    // AudioWorklet globals are not consistently exposed by every renderer;
    // pass the owning AudioContext's rate explicitly from the main thread.
    this.sampleRate = Number(options?.processorOptions?.sampleRate) || 48000;
    this.gain = 0;
    this.envelope = 0;
    this.hangoverFrames = 0;
    this.isOpen = false;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output?.length) return true;
    const thresholdDb = Math.max(-100, Math.min(0, parameters.thresholdDb?.[0] ?? -100));
    const threshold = 10 ** (thresholdDb / 20);
    let sum = 0;
    let sampleCount = 0;
    for (const channel of input || []) {
      for (const sample of channel) sum += sample * sample;
      sampleCount += channel.length;
    }
    const rms = sampleCount ? Math.sqrt(sum / sampleCount) : 0;
    const frameCount = output[0]?.length || 128;
    const envelopeTime = rms > this.envelope ? 0.012 : 0.075;
    const envelopeCoefficient = Math.exp(-frameCount / (this.sampleRate * envelopeTime));
    this.envelope = envelopeCoefficient * this.envelope + (1 - envelopeCoefficient) * rms;
    const openThreshold = threshold;
    const closeThreshold = threshold * 0.58;
    if (!this.isOpen && this.envelope >= openThreshold) {
      this.isOpen = true;
      this.hangoverFrames = Math.round(this.sampleRate * 0.28);
    } else if (this.isOpen && this.envelope >= closeThreshold) {
      this.hangoverFrames = Math.round(this.sampleRate * 0.28);
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames = Math.max(0, this.hangoverFrames - frameCount);
    } else {
      this.isOpen = false;
    }

    const targetGain = this.isOpen || this.hangoverFrames > 0 ? 1 : 0;
    const rampFrames = Math.round(this.sampleRate * (targetGain > this.gain ? 0.012 : 0.065));
    const gainStep = frameCount / Math.max(1, rampFrames);
    this.gain += Math.min(gainStep, Math.max(-gainStep, targetGain - this.gain));
    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      const destination = output[channelIndex];
      const source = input?.[Math.min(channelIndex, (input?.length || 1) - 1)];
      for (let index = 0; index < destination.length; index += 1) {
        destination[index] = (source?.[index] || 0) * this.gain;
      }
    }
    return true;
  }
}

registerProcessor('fastlynox-input-threshold', FastlynoxInputThreshold);
