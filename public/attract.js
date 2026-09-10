// attract.js - fond animé de l'accueil : des "bots" (boules lumineuses) errent,
// posent des bombes qui explosent en anneaux néon. Purement décoratif, tourne
// seulement quand l'accueil est visible.
export class Attract {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.bots = []; this.bombs = []; this.blasts = [];
    this.running = false; this.last = 0;
    this.colors = { bg: '#0a0e14', grid: '#16202e', pal: ['#00ff9c', '#ff5c8a', '#4db5ff', '#ffd23f', '#b388ff'] };
    this.raf = this._frame.bind(this);
    window.addEventListener('resize', () => this._resize());
    this._resize();
  }
  setColors(theme) {
    this.colors.bg = theme.ui.bg; this.colors.grid = theme.grid;
    this.colors.pal = Object.values(theme.powerup).concat([theme.ui.accent, theme.ui.accent2]);
  }
  _resize() {
    this.w = this.canvas.width = window.innerWidth;
    this.h = this.canvas.height = window.innerHeight;
  }
  _spawn() {
    this.bots = [];
    const n = Math.max(4, Math.min(9, Math.round(this.w / 260)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 40;
      this.bots.push({
        x: Math.random() * this.w, y: Math.random() * this.h,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: this.colors.pal[i % this.colors.pal.length],
        cd: 1 + Math.random() * 3, r: 13 + Math.random() * 5,
      });
    }
  }
  start() {
    if (this.running) return;
    this.canvas.style.display = 'block';
    if (!this.bots.length) this._spawn();
    this.running = true; this.last = performance.now();
    requestAnimationFrame(this.raf);
  }
  stop() { this.running = false; this.canvas.style.display = 'none'; }

  _frame(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    const { ctx, w, h } = this;
    ctx.fillStyle = this.colors.bg; ctx.fillRect(0, 0, w, h);

    // grille faible
    ctx.strokeStyle = this.colors.grid; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    const g = 44;
    ctx.beginPath();
    for (let x = 0; x <= w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke(); ctx.globalAlpha = 1;

    // bombes
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.t -= dt;
      if (b.t <= 0) { this.blasts.push({ x: b.x, y: b.y, r: 6, max: 90 + Math.random() * 40, life: 1, color: b.color }); this.bombs.splice(i, 1); continue; }
      const pulse = 1 + 0.15 * Math.sin(now / (60 + b.t * 40));
      ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = 10;
      ctx.fillStyle = '#e8fff6'; ctx.beginPath(); ctx.arc(b.x, b.y, 8 * pulse, 0, 7); ctx.fill();
      ctx.restore();
    }
    // explosions (anneaux néon)
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const e = this.blasts[i]; e.life -= dt * 1.6; e.r += (e.max - e.r) * dt * 6;
      if (e.life <= 0) { this.blasts.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, e.life) * 0.7; ctx.strokeStyle = e.color;
      ctx.lineWidth = 3; ctx.shadowColor = e.color; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.stroke(); ctx.restore();
    }
    // bots
    for (const bot of this.bots) {
      bot.x += bot.vx * dt; bot.y += bot.vy * dt;
      if (bot.x < 20 || bot.x > w - 20) bot.vx *= -1;
      if (bot.y < 20 || bot.y > h - 20) bot.vy *= -1;
      bot.x = Math.max(20, Math.min(w - 20, bot.x)); bot.y = Math.max(20, Math.min(h - 20, bot.y));
      bot.cd -= dt;
      if (bot.cd <= 0) { this.bombs.push({ x: bot.x, y: bot.y, t: 1.6, color: bot.color }); bot.cd = 2.5 + Math.random() * 4; }
      ctx.save(); ctx.globalAlpha = 0.9; ctx.shadowColor = bot.color; ctx.shadowBlur = 18; ctx.fillStyle = bot.color;
      ctx.beginPath(); ctx.arc(bot.x, bot.y, bot.r, 0, 7); ctx.fill();
      // regard
      ctx.shadowBlur = 0; ctx.fillStyle = this.colors.bg; ctx.globalAlpha = 1;
      const dx = Math.sign(bot.vx) * bot.r * 0.35;
      ctx.beginPath(); ctx.arc(bot.x + dx, bot.y - 2, bot.r * 0.25, 0, 7); ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(this.raf);
  }
}
