// sound.js - musique + effets generes a la volee (WebAudio, aucun fichier a telecharger).
// Style chiptune, dans l'esprit neon/retro du jeu. Tout se cree au 1er geste utilisateur
// (les navigateurs bloquent l'audio avant une interaction).
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.musicTimer = null;
    this.step = 0;
    this._lastBoom = 0;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  // A appeler sur un geste utilisateur pour debloquer l'audio.
  resume() { this.ensure(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  setEnabled(on) {
    this.enabled = on;
    if (on) { this.resume(); this.startMusic(); }
    else this.stopMusic();
  }

  // --- Petit synthe : une note ---
  note(freq, dur, type = 'square', vol = 0.2, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // --- Effets ---
  blip() { this.note(660, 0.08, 'square', 0.18); }                 // pose de bombe
  pickup() { this.note(880, 0.06, 'triangle', 0.2); this.note(1320, 0.09, 'triangle', 0.2, 0.06); }
  boom() {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now(); if (now - this._lastBoom < 90) return; this._lastBoom = now;
    const t = this.ctx.currentTime;
    // souffle = bruit blanc filtre qui descend
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.32);
  }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.note(f, 0.18, 'square', 0.22, i * 0.12)); }
  lose() { [392, 330, 262].forEach((f, i) => this.note(f, 0.22, 'sawtooth', 0.18, i * 0.14)); }
  // Rire debile et un peu glauque : bursts descendants, detunes, filtres bas
  laugh() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const base = [230, 210, 195, 175, 160, 150];
    base.forEach((f, i) => {
      const when = i * 0.12;
      this.note(f, 0.09, 'sawtooth', 0.16, when);        // "ha"
      this.note(f * 0.5 + 4, 0.11, 'square', 0.12, when); // basse detune, effet glauque
    });
  }

  // --- Musique de fond : une boucle simple basse + arpege ---
  startMusic() {
    if (!this.enabled || !this.ctx || this.musicTimer) return;
    const bass = [131, 131, 165, 196];            // do do mi sol (Hz)
    const arp = [523, 659, 784, 659, 587, 494, 587, 659];
    const beat = 0.28;
    this.step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const s = this.step;
      if (s % 2 === 0) this.note(bass[(s / 2) % bass.length], beat * 1.6, 'triangle', 0.14);
      this.note(arp[s % arp.length], beat * 0.8, 'square', 0.06);
      this.step++;
    }, beat * 1000);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
