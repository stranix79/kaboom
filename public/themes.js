// themes.js - trois habillages visuels au choix du joueur.
// Chaque theme definit : les couleurs de l'ARENE (relues par render.js sur le canvas)
// ET un bloc `ui` (variables CSS appliquees a toute la page par client.js -> applyTheme).
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
    ui: { bg: '#0a0e14', panel: '#111925', panel2: '#0f1620', line: '#1d2a3a', text: '#d7fbee', muted: '#6f8598', accent: '#00ff9c', accent2: '#ff5c8a', onAccent: '#06110b', fontFamily: "'DM Mono', ui-monospace, monospace" },
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
    ui: { bg: '#14162a', panel: '#232a4d', panel2: '#1a1f3a', line: '#3a4270', text: '#f4f4f4', muted: '#8a92c0', accent: '#41a6f6', accent2: '#ef7d57', onAccent: '#0b1024', fontFamily: "ui-monospace, monospace" },
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
    ui: { bg: '#f4f1ea', panel: '#ffffff', panel2: '#faf8f3', line: '#e0dacd', text: '#2b2b2b', muted: '#8a8577', accent: '#ff7a59', accent2: '#3b82f6', onAccent: '#ffffff', fontFamily: "system-ui, sans-serif" },
  },
};
