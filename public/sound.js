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
    // Bus d'effets caverneux : echo (delay + feedback) + reverb (convolver).
    // On y envoie les sons qui doivent sonner "lugubre" (ex : le rire).
    this.delay = this.ctx.createDelay(1.0); this.delay.delayTime.value = 0.28;
    this.fb = this.ctx.createGain(); this.fb.gain.value = 0.5;
    this.delay.connect(this.fb); this.fb.connect(this.delay);
    this.reverb = this.ctx.createConvolver(); this.reverb.buffer = this._impulse(2.6, 3);
    this.fxIn = this.ctx.createGain(); this.fxIn.gain.value = 0.9;
    this.fxIn.connect(this.delay); this.delay.connect(this.master);
    this.fxIn.connect(this.reverb); this.reverb.connect(this.master);
    this._loadLaugh();
  }

  // Si un fichier public/laugh.mp3 existe (ta voix ou un rire Halloween libre de droits),
  // on le joue a la place du rire de synthese. Sinon on retombe sur le cackle synthetise.
  _loadLaugh() {
    if (this._laughTried || !this.ctx) return;
    this._laughTried = true;
    const load = (url) => fetch(url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(ab => this.ctx.decodeAudioData(ab));
    fetch('/assets.json').then(r => r.json()).then(a => {
      if (a.laugh) load('/laugh.mp3').then(b => { this.laughBuffer = b; }).catch(() => {});
      if (a.boom) load('/boom.mp3').then(b => { this.boomBuffer = b; }).catch(() => {});
    }).catch(() => {});
  }

  _impulse(dur, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // A appeler sur un geste utilisateur pour debloquer l'audio.
  resume() { this.ensure(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  // Le bouton ne coupe QUE la musique. Les bruitages et le rire jouent toujours.
  setMusic(on) {
    this.enabled = on;
    if (on) { this.resume(); this.startMusic(); }
    else this.stopMusic();
  }

  // --- Petit synthe : une note ---
  note(freq, dur, type = 'square', vol = 0.2, when = 0) {
    if (!this.ctx) return;
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
  // Explosion "originale" : sub qui plonge (le "woomph") + souffle bruite + crepitement aigu,
  // avec une pointe envoyee dans la reverb pour la queue. Ou public/boom.mp3 si present.
  boom() {
    if (!this.ctx) return;
    const now = performance.now(); if (now - this._lastBoom < 90) return; this._lastBoom = now;
    if (this.boomBuffer) { this._playBuffer(this.boomBuffer, 0.9); return; }
    const t = this.ctx.currentTime;
    // 1) sub sine qui descend -> l'impact grave
    const sub = this.ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(140, t); sub.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const sg = this.ctx.createGain(); sg.gain.setValueAtTime(0.5, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    sub.connect(sg); sg.connect(this.master); sub.start(t); sub.stop(t + 0.42);
    // 2) souffle = bruit filtre passe-bas descendant
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.35, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    if (this.fxIn) { const rg = this.ctx.createGain(); rg.gain.value = 0.25; g.connect(rg); rg.connect(this.fxIn); }
    src.start(t); src.stop(t + 0.37);
    // 3) crepitement aigu bref (debris)
    const hp = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.12, this.ctx.sampleRate);
    const hd = hp.getChannelData(0);
    for (let i = 0; i < hd.length; i++) hd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / hd.length, 2);
    const hs = this.ctx.createBufferSource(); hs.buffer = hp;
    const hf = this.ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 2600;
    const hg = this.ctx.createGain(); hg.gain.setValueAtTime(0.18, t); hg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    hs.connect(hf); hf.connect(hg); hg.connect(this.master); hs.start(t); hs.stop(t + 0.13);
  }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.note(f, 0.18, 'square', 0.22, i * 0.12)); }
  lose() { [392, 330, 262].forEach((f, i) => this.note(f, 0.22, 'sawtooth', 0.18, i * 0.14)); }
  // Rire debile et un peu glauque : bursts descendants, detunes, filtres bas
  // Joue un buffer audio (fichier) via le bus direct + reverb.
  _playBuffer(buf, vol = 0.9) {
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); if (this.fxIn) g.connect(this.fxIn);
    s.start();
  }

  // Une syllabe de rire "voix" : source glottale (dents de scie) filtree par des FORMANTS
  // (3 bandpass = timbre de voyelle) -> beaucoup plus humain qu'un simple oscillateur.
  _syllable(when, pitch, vowel, dur, vol) {
    const ctx = this.ctx;
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(pitch, when);
    src.frequency.exponentialRampToValueAtTime(pitch * 0.82, when + dur); // chute naturelle
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;        // vibrato
    const lg = ctx.createGain(); lg.gain.value = pitch * 0.04; lfo.connect(lg); lg.connect(src.frequency);
    const env = ctx.createGain(); const g = env.gain;
    g.setValueAtTime(0.0001, when);
    g.linearRampToValueAtTime(vol, when + 0.02);
    g.exponentialRampToValueAtTime(0.0001, when + dur);
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = vowel[i]; bp.Q.value = 9 + i * 3;
      const gg = ctx.createGain(); gg.gain.value = [1, 0.7, 0.4][i];
      src.connect(bp); bp.connect(gg); gg.connect(env);
    }
    env.connect(this.master); if (this.fxIn) env.connect(this.fxIn);
    src.start(when); lfo.start(when); src.stop(when + dur + 0.05); lfo.stop(when + dur + 0.05);
  }

  // Rire de sorcière Halloween : cackle "hi-ha-hi-ha" à formants, dans l'écho + la reverb.
  // Si public/laugh.mp3 existe (ta voix ou un rire libre de droits), on le joue à la place.
  laugh() {
    this.resume();
    if (!this.ctx) return;
    if (this.laughBuffer) { this._playBuffer(this.laughBuffer, 1); return; }
    const AH = [720, 1090, 2440], EE = [300, 2100, 3010], EH = [530, 1840, 2480];
    const vowels = [EE, AH, EE, EH, AH, EE, EH, AH, EE];
    let when = this.ctx.currentTime, pitch = 320;
    for (let i = 0; i < vowels.length; i++) {
      this._syllable(when, pitch, vowels[i], 0.12, 0.5);
      when += 0.145;
      pitch *= (i < 4 ? 1.03 : 0.93); // monte puis redescend = cackle
    }
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
