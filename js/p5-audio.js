/**
 * Persona 5 Audio Engine - Powered by official assets from ffaneto/persona5-website-theme
 */
class P5AudioEngine {
  constructor() {
    this.soundEnabled = true;
    this.bgmPlaying = false;
    this.bgmVolume = 0.35;
    this.selectAudio = new Audio('assets/select.mp3');
    this.bgmAudio = new Audio('assets/background.mp3');
    this.bgmAudio.loop = true;
    this.bgmAudio.volume = this.bgmVolume;
  }

  playSelect() {
    if (!this.soundEnabled) return;
    try {
      this.selectAudio.currentTime = 0;
      this.selectAudio.volume = 0.6;
      this.selectAudio.play().catch(() => {});
    } catch (e) {}
  }

  playHover() {
    if (!this.soundEnabled) return;
    try {
      this.selectAudio.currentTime = 0;
      this.selectAudio.volume = 0.25;
      this.selectAudio.play().catch(() => {});
    } catch (e) {}
  }

  playCardSent() {
    if (!this.soundEnabled) return;
    try {
      this.selectAudio.currentTime = 0;
      this.selectAudio.volume = 0.8;
      this.selectAudio.play().catch(() => {});
    } catch (e) {}
  }

  // All-Out Attack Knife Slash Impact
  playSlashAttack() {
    if (!this.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Noise burst for sword slash
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);

      // Chime chords
      [880, 1318.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.2, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.08);
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
