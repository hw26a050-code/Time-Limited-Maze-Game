// Synthesizer sounds for the maze game using Web Audio API

let audioCtx: AudioContext | null = null;
let isMuted = false;

function initAudio() {
  if (isMuted) return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  // Try to resume if suspended due to autoplay policy
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const soundManager = {
  getMuteState() {
    return isMuted;
  },

  setMute(mute: boolean) {
    isMuted = mute;
    if (mute && audioCtx) {
      audioCtx.close().then(() => {
        audioCtx = null;
      });
    }
  },

  playMove() {
    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  },

  playGoal() {
    const ctx = initAudio();
    if (!ctx) return;

    const playNote = (freq: number, delay: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    };

    // Upbeat ascending major arpeggio
    playNote(523.25, 0.0, 0.15); // C5
    playNote(659.25, 0.08, 0.15); // E5
    playNote(783.99, 0.16, 0.15); // G5
    playNote(1046.50, 0.24, 0.35); // C6
  },

  playGameOver() {
    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    // Filter to make the sawtooth sound warm and retro instead of harsh
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  },

  playClockTick() {
    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  },

  playStageStart() {
    const ctx = initAudio();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(440, ctx.currentTime); // A4
    osc1.frequency.setValueAtTime(554.37, ctx.currentTime + 0.12); // C#5
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.24); // E5

    osc2.frequency.setValueAtTime(440 * 2, ctx.currentTime);
    osc2.frequency.setValueAtTime(554.37 * 2, ctx.currentTime + 0.12);
    osc2.frequency.setValueAtTime(659.25 * 2, ctx.currentTime + 0.24);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    osc1.stop(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.5);
  },

  playClick() {
    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.02);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }
};
