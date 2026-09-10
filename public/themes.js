// themes.js - trois habillages visuels au choix du joueur.
// Chaque theme est un jeu de couleurs + quelques options de style relues par render.js.
export const THEMES = {
  neon: {
    label: 'Néon terminal',
    bg: '#0a0e14', floor: '#0f1620', grid: '#16202e',
    wall: '#233248', wallEdge: '#2f4456',
    block: '#1d2c3f', blockEdge: '#2a4460',
    bomb: '#e8fff6', fuse: '#00ff9c',
    explosion: '#00ff9c', explosionCore: '#eafff7',
    powerup: { bomb: '#4db5ff', fire: '#ff5c8a', speed: '#ffd23f' },
    text: '#d7fbee', ghost: 'rgba(0,255,156,0.35)',
    glow: true, font: "700 12px 'DM Mono', ui-monospace, monospace", round: 3,
  },
  retro: {
    label: 'Pixel rétro',
    bg: '#1a1c2c', floor: '#3b5dc9', grid: '#3350b0',
    wall: '#94b0c2', wallEdge: '#566c86',
    block: '#a8763e', blockEdge: '#7a5230',
    bomb: '#1a1c2c', fuse: '#ef7d57',
    explosion: '#ffcd75', explosionCore: '#fff5e1',
    powerup: { bomb: '#41a6f6', fire: '#ef7d57', speed: '#a7f070' },
    text: '#f4f4f4', ghost: 'rgba(255,255,255,0.4)',
    glow: false, font: "700 12px ui-monospace, monospace", round: 0,
  },
  minimal: {
    label: 'Minimal flat',
    bg: '#f4f1ea', floor: '#ffffff', grid: '#e7e2d8',
    wall: '#2b2b2b', wallEdge: '#2b2b2b',
    block: '#c9c2b4', blockEdge: '#b3ab9b',
    bomb: '#2b2b2b', fuse: '#ff5c5c',
    explosion: '#ff7a59', explosionCore: '#ffd0b8',
    powerup: { bomb: '#3b82f6', fire: '#ef4444', speed: '#f59e0b' },
    text: '#2b2b2b', ghost: 'rgba(43,43,43,0.28)',
    glow: false, font: "700 12px system-ui, sans-serif", round: 6,
  },
};
