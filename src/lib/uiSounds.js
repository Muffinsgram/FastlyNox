import { getAppPreferences } from './appPreferences';

let audioContext;

const soundNotes = {
  join: [{ frequency: 523, duration: 0.075 }, { frequency: 659, duration: 0.075 }, { frequency: 784, duration: 0.14 }],
  leave: [{ frequency: 784, duration: 0.07 }, { frequency: 587, duration: 0.08 }, { frequency: 440, duration: 0.15 }],
  move: [{ frequency: 523, duration: 0.07 }, { frequency: 659, duration: 0.07 }, { frequency: 784, duration: 0.12 }],
  microphoneOn: [{ frequency: 659, duration: 0.055 }, { frequency: 880, duration: 0.075 }],
  microphoneOff: [{ frequency: 587, duration: 0.07 }, { frequency: 440, duration: 0.09 }],
  headphonesOn: [{ frequency: 523, duration: 0.06 }, { frequency: 784, duration: 0.085 }],
  headphonesOff: [{ frequency: 659, duration: 0.06 }, { frequency: 392, duration: 0.1 }],
  incomingCall: [{ frequency: 784, duration: 0.12 }, { frequency: 988, duration: 0.16 }, { frequency: 784, duration: 0.12 }],
  callOutgoing: [{ frequency: 587, duration: 0.1 }, { frequency: 784, duration: 0.12 }],
  callAccepted: [{ frequency: 523, duration: 0.08 }, { frequency: 659, duration: 0.08 }, { frequency: 880, duration: 0.17 }],
  callDeclined: [{ frequency: 587, duration: 0.1 }, { frequency: 392, duration: 0.18 }],
  callEnded: [{ frequency: 659, duration: 0.08 }, { frequency: 440, duration: 0.16 }],
  soundboardChime: [{ frequency: 784, duration: 0.11 }, { frequency: 988, duration: 0.14 }, { frequency: 1175, duration: 0.22 }],
  soundboardPulse: [{ frequency: 440, duration: 0.1 }, { frequency: 554, duration: 0.1 }, { frequency: 659, duration: 0.18 }],
  soundboardDrop: [{ frequency: 880, duration: 0.08 }, { frequency: 659, duration: 0.08 }, { frequency: 440, duration: 0.22 }],
};

export function playUiSound(name, userId) {
  const preferences = getAppPreferences(userId);
  const controlVolume = name.startsWith('microphone') ? preferences.microphoneToggleSoundVolume : name.startsWith('headphones') ? preferences.headphoneToggleSoundVolume : null;
  const volume = controlVolume == null ? preferences.uiSoundVolume : controlVolume;
  if (typeof window === 'undefined' || !preferences.soundEffects || volume <= 0) return;
  const notes = soundNotes[name];
  if (!notes) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    audioContext ||= new AudioContextClass();
    const context = audioContext;
    const play = () => {
      if (context.state !== 'running') return;
      let offset = 0;
      notes.forEach(({ frequency, duration }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + offset;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.11 * (volume / 100), start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.015);
        offset += duration + 0.035;
      });
    };
    if (context.state === 'suspended') void context.resume().then(play).catch(() => {});
    else play();
  } catch {
    // Browsers can block audio until the user interacts with the app.
  }
}
