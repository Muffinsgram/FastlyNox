class FastlynoxVoiceActivityGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'thresholdDb', defaultValue: -54, minValue: -75, maxValue: -20, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.gain = 0;
    this.hangoverFrames = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output?.length) return true;
    const thresholdDb = parameters.thresholdDb?.[0] ?? -54;
    const threshold = 10 ** (thresholdDb / 20);
    let sum = 0;
    let sampleCount = 0;
    for (const channel of input || []) {
      for (const sample of channel) sum += sample * sample;
      sampleCount += channel.length;
    }
    const rms = sampleCount ? Math.sqrt(sum / sampleCount) : 0;
    if (rms >= threshold) this.hangoverFrames = Math.round(sampleRate * 0.18);
    else this.hangoverFrames = Math.max(0, this.hangoverFrames - (output[0]?.length || 128));

    const targetGain = this.hangoverFrames > 0 ? 1 : 0;
    const frameCount = output[0]?.length || 128;
    const rampFrames = Math.round(sampleRate * (targetGain > this.gain ? 0.018 : 0.035));
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

registerProcessor('fastlynox-voice-activity-gate', FastlynoxVoiceActivityGate);
