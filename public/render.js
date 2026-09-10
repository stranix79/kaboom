// render.js - dessine l'arene sur le canvas selon le theme choisi.
export function drawGame(ctx, state, view, theme, tile) {
  const { cols, rows, grid } = state;
  const W = cols * tile, H = rows * tile;

  // Fond + sol quadrille
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r * cols + c];
      const x = c * tile, y = r * tile;
      if (cell === '0') {
        ctx.fillStyle = theme.floor; ctx.fillRect(x, y, tile, tile);
        ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      } else if (cell === '1') {
        roundRect(ctx, x + 1, y + 1, tile - 2, tile - 2, theme.round);
        ctx.fillStyle = theme.wall; ctx.fill();
        ctx.strokeStyle = theme.wallEdge; ctx.lineWidth = 2; ctx.stroke();
      } else if (cell === '2') {
        roundRect(ctx, x + 2, y + 2, tile - 4, tile - 4, theme.round);
        ctx.fillStyle = theme.block; ctx.fill();
        ctx.strokeStyle = theme.blockEdge; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }

  // Power-ups
  for (const pu of state.powerups) {
    const x = pu.c * tile + tile / 2, y = pu.r * tile + tile / 2;
    ctx.save();
    if (theme.glow) { ctx.shadowColor = theme.powerup[pu.type]; ctx.shadowBlur = 12; }
    ctx.fillStyle = theme.powerup[pu.type];
    roundRect(ctx, x - tile * 0.28, y - tile * 0.28, tile * 0.56, tile * 0.56, theme.round + 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = theme.bg; ctx.font = `900 ${tile * 0.5}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pu.type === 'bomb' ? '+' : pu.type === 'fire' ? '✳' : '»', x, y + 1);
  }

  // Bombes (pulsation qui accelere quand le timer approche 0)
  for (const b of state.bombs) {
    const x = b.c * tile + tile / 2, y = b.r * tile + tile / 2;
    const pulse = 1 + 0.12 * Math.sin(Date.now() / (80 + b.timer * 60));
    const rad = tile * 0.34 * pulse;
    ctx.save();
    if (theme.glow) { ctx.shadowColor = theme.fuse; ctx.shadowBlur = 10; }
    ctx.fillStyle = b.ghost ? theme.ghost : theme.bomb;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = theme.fuse; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.timer / 2.4)); ctx.stroke();
  }

  // Explosions
  for (const e of state.explosions) {
    const x = e.c * tile, y = e.r * tile;
    ctx.save();
    if (theme.glow) { ctx.shadowColor = theme.explosion; ctx.shadowBlur = 18; }
    ctx.fillStyle = theme.explosion;
    roundRect(ctx, x + 2, y + 2, tile - 4, tile - 4, theme.round);
    ctx.fill();
    ctx.fillStyle = theme.explosionCore;
    roundRect(ctx, x + tile * 0.22, y + tile * 0.22, tile * 0.56, tile * 0.56, theme.round);
    ctx.fill();
    ctx.restore();
  }

  // Joueurs et fantomes (positions interpolees fournies par view)
  for (const p of state.players) {
    const v = view[p.id] || { x: p.x, y: p.y };
    const x = v.x * tile, y = v.y * tile;
    ctx.save();
    if (p.ghost) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = theme.ghost;
      ctx.beginPath(); ctx.arc(x, y - 2, tile * 0.32, Math.PI, 0); ctx.lineTo(x + tile * 0.32, y + tile * 0.3);
      for (let i = 0; i < 3; i++) ctx.lineTo(x + tile * 0.32 - (i + 0.5) * tile * 0.21, y + tile * 0.3 - (i % 2 ? 0 : tile * 0.1));
      ctx.lineTo(x - tile * 0.32, y + tile * 0.3); ctx.closePath(); ctx.fill();
    } else {
      if (theme.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 12; }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(x, y, tile * 0.34, 0, Math.PI * 2); ctx.fill();
      // regard directionnel
      ctx.fillStyle = theme.bg;
      const off = tile * 0.16;
      const ex = x + (p.dir === 'left' ? -off : p.dir === 'right' ? off : 0);
      const ey = y + (p.dir === 'up' ? -off : p.dir === 'down' ? off : 0);
      ctx.beginPath(); ctx.arc(ex, ey, tile * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // nom
    ctx.fillStyle = theme.text; ctx.font = theme.font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.globalAlpha = p.ghost ? 0.6 : 1;
    ctx.fillText(p.name, x, y - tile * 0.42);
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
