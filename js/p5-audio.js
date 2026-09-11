/**
 * Persona 5 Audio Synthesizer (Web Audio API)
 * Generates authentic arcade/Persona UI sound effects without requiring external audio files!
 * Persona 5 Audio Engine - Powered by official assets from ffaneto/persona5-website-theme
 */
class P5AudioEngine {
  constructor() {
    this.ctx = null;
    this.soundEnabled = true;
    this.bgmPlaying = false;
    this.bgmVolume = 0.35;
    this.selectAudio = new Audio('assets/select.mp3');
    this.bgmAudio = new Audio('assets/background.mp3');
    this.bgmAudio.loop = true;
    this.bgmAudio.volume = this.bgmVolume;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Soft Menu Navigation Blip
  playHover() {
  playSelect() {
    if (!this.soundEnabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
      this.selectAudio.currentTime = 0;
      this.selectAudio.volume = 0.6;
      this.selectAudio.play().catch(() => {});
    } catch (e) {}
  }

  // Persona 5 Snappy Select Click
  playSelect() {
  playHover() {
    if (!this.soundEnabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(620, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.06);
      this.selectAudio.currentTime = 0;
      this.selectAudio.volume = 0.25;
      this.selectAudio.play().catch(() => {});
    } catch (e) {}
  }

  // Calling Card Sent / Task Added Whoosh
  playCardSent() {
    if (!this.soundEnabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(250, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(950, this.ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
      this.selectAudio.currentTime = 0;
      this.selectAudio.volume = 0.8;
      this.selectAudio.play().catch(() => {});
    } catch (e) {}
  }

  // All-Out Attack Knife Slash Strike on Task Completion
  // All-Out Attack Knife Slash Impact
  playSlashAttack() {
    if (!this.soundEnabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Noise burst for the slash impact
      const bufferSize = this.ctx.sampleRate * 0.12;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      // Noise burst for sword slash
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.12);
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);

      // Stylized triumph chimes (G5, C6)
      [783.99, 1046.50].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
      // Chime chords
      [880, 1318.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.15, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
        g.gain.setValueAtTime(0.2, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);
        osc.connect(g);
        g.connect(this.ctx.destination);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
        osc.stop(now + idx * 0.08 + 0.4);
      });
    } catch (e) {}
  }

  toggleBgm() {
    if (this.bgmPlaying) {
      this.bgmAudio.pause();
      this.bgmPlaying = false;
      return false;
    } else {
      this.bgmAudio.play().then(() => {
        this.bgmPlaying = true;
      }).catch((e) => {
        console.warn('BGM play blocked until user interaction:', e);
      });
      return true;
    }
  }

  setBgmVolume(val) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    this.bgmAudio.volume = this.bgmVolume;
  }
}

window.p5Audio = new P5AudioEngine();

