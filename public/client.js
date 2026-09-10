// client.js - connexion WebSocket, gestion des ecrans et boucle de rendu.
import { THEMES } from './themes.js';
import { drawGame } from './render.js';

const $ = (id) => document.getElementById(id);
const screens = { home: $('home'), lobby: $('lobby'), game: $('game') };
function show(name) { for (const k in screens) screens[k].hidden = k !== name; }

// ---- Preferences persistees ----
let myName = localStorage.getItem('kaboom_name') || '';
let themeKey = localStorage.getItem('kaboom_theme') || 'neon';
$('name').value = myName;

// ---- Etat client ----
let ws, myId = null, room = null;
let state = null;              // dernier etat recu du serveur
const view = {};              // positions interpolees id -> {x,y}
const keys = {};
let lastInput = { ax: 0, ay: 0 };

// ---- Connexion ----
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    if (myName) sendName(myName);
    const params = new URLSearchParams(location.search);
    const code = params.get('room');
    if (code) $('joinCode').value = code.toUpperCase();
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => { setTimeout(connect, 1000); };
}
function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function sendName(n) { send({ t: 'setName', name: n }); }

function handle(m) {
  switch (m.t) {
    case 'hello': myId = m.id; break;
    case 'rooms': renderRooms(m.list); break;
    case 'joined':
      room = { code: m.code };
      history.replaceState(null, '', `?room=${m.code}`);
      show('lobby');
      break;
    case 'lobby': renderLobby(m); break;
    case 'start': startGameView(); break;
    case 'state': state = m.s; break;
    case 'error': toast(m.msg); break;
  }
}

// ---- Ecran d'accueil ----
function renderRooms(list) {
  const box = $('rooms');
  if (!list.length) { box.innerHTML = '<p class="muted">Aucune partie publique. Cree la premiere !</p>'; return; }
  box.innerHTML = '';
  for (const r of list) {
    const el = document.createElement('button');
    el.className = 'room';
    el.innerHTML = `<span class="rname">${esc(r.name)}</span>
      <span class="rmeta">${r.players}/${r.max} · ${r.phase === 'playing' ? 'en cours' : 'lobby'}</span>`;
    el.onclick = () => joinRoom(r.code);
    box.appendChild(el);
  }
}

function joinRoom(code) {
  const n = ($('name').value || '').trim();
  if (!n) return toast('Choisis un pseudo.');
  saveName(n);
  send({ t: 'join', code, name: n });
}

$('createBtn').onclick = () => {
  const n = ($('name').value || '').trim();
  if (!n) return toast('Choisis un pseudo.');
  saveName(n);
  send({
    t: 'create', name: n,
    roomName: ($('roomName').value || 'Arene').trim(),
    max: Number($('maxPlayers').value),
    private: $('isPrivate').checked,
  });
};
$('joinBtn').onclick = () => {
  const code = ($('joinCode').value || '').trim().toUpperCase();
  if (code) joinRoom(code);
};

function saveName(n) { myName = n; localStorage.setItem('kaboom_name', n); sendName(n); }

// ---- Selecteur de theme ----
function buildThemePicker() {
  const box = $('themePicker');
  box.innerHTML = '';
  for (const key in THEMES) {
    const b = document.createElement('button');
    b.className = 'chip' + (key === themeKey ? ' active' : '');
    b.textContent = THEMES[key].label;
    b.onclick = () => { themeKey = key; localStorage.setItem('kaboom_theme', key); buildThemePicker(); };
    box.appendChild(b);
  }
}

// ---- Lobby ----
function renderLobby(m) {
  room = { code: m.code, phase: m.phase };
  $('lobbyName').textContent = m.name;
  $('lobbyCode').textContent = m.code;
  $('shareLink').value = `${location.origin}?room=${m.code}`;
  const box = $('lobbyPlayers');
  box.innerHTML = '';
  for (const p of m.players) {
    const el = document.createElement('div');
    el.className = 'plobby';
    el.innerHTML = `<span class="dot" style="background:${p.color}"></span>${esc(p.name)}`;
    box.appendChild(el);
  }
  $('startBtn').textContent = m.players.length < 2 ? "Jouer en solo (entrainement)" : `Lancer (${m.players.length} joueurs)`;
}
$('startBtn').onclick = () => send({ t: 'start' });
$('leaveBtn').onclick = () => { send({ t: 'leave' }); history.replaceState(null, '', location.pathname); show('home'); };
$('copyLink').onclick = () => { $('shareLink').select(); navigator.clipboard?.writeText($('shareLink').value); toast('Lien copie !'); };

// ---- Passage en jeu ----
function startGameView() { show('game'); }

// ---- Entrees clavier ----
window.addEventListener('keydown', (e) => {
  if (screens.game.hidden) return;
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); send({ t: 'plant' }); return; }
  keys[e.code] = true; updateInput();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; updateInput(); });

function updateInput() {
  const ax = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
  const ay = (keys['ArrowDown'] || keys['KeyS'] ? 1 : 0) - (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0);
  if (ax !== lastInput.ax || ay !== lastInput.ay) { lastInput = { ax, ay }; send({ t: 'input', ax, ay }); }
}

// ---- Commandes tactiles (mobile) ----
function bindTouch(id, ax, ay) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); keys['_t'] = true; lastInput = { ax, ay }; send({ t: 'input', ax, ay }); };
  const off = (e) => { e.preventDefault(); lastInput = { ax: 0, ay: 0 }; send({ t: 'input', ax: 0, ay: 0 }); };
  el.addEventListener('touchstart', on); el.addEventListener('touchend', off);
  el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
}
bindTouch('padUp', 0, -1); bindTouch('padDown', 0, 1); bindTouch('padLeft', -1, 0); bindTouch('padRight', 1, 0);
$('padBomb').addEventListener('touchstart', (e) => { e.preventDefault(); send({ t: 'plant' }); });
$('padBomb').addEventListener('mousedown', (e) => { e.preventDefault(); send({ t: 'plant' }); });

// ---- Boucle de rendu ----
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let tile = 34;

function loop() {
  requestAnimationFrame(loop);
  if (screens.game.hidden || !state) return;
  const theme = THEMES[themeKey];

  // taille du canvas selon l'arene
  const W = state.cols * tile, H = state.rows * tile;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

  // interpolation douce des positions
  for (const p of state.players) {
    if (!view[p.id]) view[p.id] = { x: p.x, y: p.y };
    view[p.id].x += (p.x - view[p.id].x) * 0.35;
    view[p.id].y += (p.y - view[p.id].y) * 0.35;
  }
  for (const id in view) if (!state.players.find(p => p.id == id)) delete view[id];

  drawGame(ctx, state, view, theme, tile);
  updateHud(theme);
}

function updateHud(theme) {
  const alive = state.players.filter(p => p.alive && !p.ghost).length;
  const sd = state.suddenDeathIn;
  $('hudAlive').textContent = `${alive} en vie`;
  $('hudTimer').textContent = sd > 0 ? `mort subite dans ${Math.ceil(sd)}s` : '☠ MORT SUBITE';
  $('hudTimer').classList.toggle('danger', sd <= 0 || sd < 10);

  const me = state.players.find(p => p.id == myId);
  $('hudStats').textContent = me ? `💣 ${me.bombs}  ✳ ${me.range}` : '';

  const over = $('overlay');
  if (state.phase === 'over') {
    over.hidden = false;
    $('overTitle').textContent = state.winner ? `🏆 ${state.winner.name} gagne !` : 'Egalite !';
    $('overSub').textContent = `Nouvelle manche dans ${Math.ceil(state.restartIn)}s`;
  } else over.hidden = true;
}

// ---- Utils ----
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2500);
}

buildThemePicker();
connect();
loop();
