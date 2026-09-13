/**
 * Kiwi Kifu - Synthesized Acoustic Go Audio Effects (Web Audio API)
 */

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = typeof localStorage !== 'undefined' ?
      (localStorage.getItem('kiwikifu_sound') !== null ? localStorage.getItem('kiwikifu_sound') !== 'false' : localStorage.getItem('simplekifu_sound') !== 'false')
      : true;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kiwikifu_sound', this.enabled ? 'true' : 'false');
    }
    if (this.enabled) {
      this.playStone();
    }
    return this.enabled;
  }

  initContext() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playStone() {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const jitter = 0.94 + Math.random() * 0.12;

      // 1. Sharp slate/shell impact transient
      const snapOsc = this.ctx.createOscillator();
      const snapGain = this.ctx.createGain();
      snapOsc.type = 'triangle';
      snapOsc.frequency.setValueAtTime(1500 * jitter, now);
      snapOsc.frequency.exponentialRampToValueAtTime(250, now + 0.022);

      snapGain.gain.setValueAtTime(0.45, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

      snapOsc.connect(snapGain);
      snapGain.connect(this.ctx.destination);
      snapOsc.start(now);
      snapOsc.stop(now + 0.025);

      // 2. Kaya wood board resonance thud
      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(440 * jitter, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(180, now + 0.075);

      bodyGain.gain.setValueAtTime(0.65, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(this.ctx.destination);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.08);
    } catch (e) {
      // Audio context might fail in autoplay restricted browsers
    }
  }

  playPass() {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch (e) {}
  }
}
