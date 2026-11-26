// audio.js — synthesised sound only (WebAudio oscillators and filtered noise).
// No audio files are shipped; every sound is generated at run time.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
  }

  // Must be called from a user gesture (click / keypress) — browsers block audio
  // before one.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine hum: two detuned saws through a low-pass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55.7;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
    // Wind: looped noise buffer through a band-pass filter.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 500;
    band.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(band); band.connect(this.windGain); this.windGain.connect(this.ctx.destination);
    noise.start();
  }

  update(throttle, speed01, flying) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const target = flying ? 0.045 + throttle * 0.075 : 0.02 + throttle * 0.02;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(48 + throttle * 65, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(48.6 + throttle * 66, t, 0.1);
    this.windGain.gain.setTargetAtTime(speed01 * 0.11, t, 0.2);
  }

  chime() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (const [freq, when] of [[880, 0], [1318, 0.09]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + when);
      g.gain.exponentialRampToValueAtTime(0.22, t + when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + when + 0.5);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + when); o.stop(t + when + 0.55);
    }
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.45);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.06, t, 0.05);
      this.windGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
}
