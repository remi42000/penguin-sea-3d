// Procedural Web Audio soundscape & sound effects (zero external assets needed)

export class OceanAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
    this.ambientFilter = null;
    this.ambientGain = null;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // Create looping soft ocean noise buffer (3 seconds)
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Brownish-pink ocean noise with gentle wave swell envelope
      lastOut = (lastOut + 0.035 * white) / 1.035;
      const swell = 0.72 + 0.28 * Math.sin((i / length) * Math.PI * 2);
      data[i] = lastOut * 2.4 * swell;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 420;
    this.ambientFilter.Q.value = 0.9;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.22;

    noiseSource.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    noiseSource.start();

    this.noiseBuffer = buffer;
    this.initialized = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.06);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  updateAmbient(cameraY, speed) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const isUnderwater = cameraY < 0.0;
    const targetFreq = isUnderwater
      ? Math.max(150, 290 + cameraY * 7 + speed * 14)
      : 780 + Math.min(speed * 25, 300);
    const targetGain = isUnderwater ? 0.28 : 0.16;
    this.ambientFilter.frequency.setTargetAtTime(targetFreq, now, 0.12);
    this.ambientGain.gain.setTargetAtTime(targetGain, now, 0.12);
  }

  playSplash(intensity = 1.0) {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1.2, Math.max(0.25, intensity));

    // Filtered noise splash
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1.3 + Math.random() * 0.4;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.35);
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.38 * vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now, Math.random() * 1.5, 0.42);

    // Cute water droplet bloops
    for (let i = 0; i < 3; i++) {
      const t = now + 0.04 + i * 0.055;
      this._playTone(340 + Math.random() * 320, 620 + Math.random() * 260, t, 0.07, 0.09 * vol, 'sine');
    }
  }

  playDash() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.04;
      const base = 300 + i * 95 + Math.random() * 50;
      this._playTone(base, base * 1.55, t, 0.065, 0.1, 'sine');
    }
  }

  playCatchFish(isGolden = false) {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isGolden ? [587.33, 739.99, 880, 1174.66] : [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      this._playTone(freq, freq * 1.01, t, 0.16, isGolden ? 0.16 : 0.12, 'triangle');
    });
  }

  playBubbleRing() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1046.5];
    notes.forEach((freq, idx) => {
      this._playTone(freq * 0.92, freq * 1.12, now + idx * 0.045, 0.11, 0.11, 'sine');
    });
  }

  playSealGreeting() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    // Two friendly playful seal "arf-arf!" chirps
    [0, 0.16].forEach((offset, idx) => {
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const pitch = idx === 0 ? 310 : 355;
      osc.frequency.setValueAtTime(pitch * 0.78, t);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, t + 0.045);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + 0.12);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 680;
      filter.Q.value = 2.4;

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  playAlert() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    this._playTone(210, 260, now, 0.11, 0.14, 'triangle');
    this._playTone(260, 310, now + 0.11, 0.14, 0.14, 'triangle');
  }

  playBump() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    this._playTone(170, 68, now, 0.24, 0.26, 'sine');
    this.playSplash(0.7);
  }

  _playTone(startFreq, endFreq, startTime, duration, volume, type = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + duration * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }
}
