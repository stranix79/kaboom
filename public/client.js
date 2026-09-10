// client.js - connexion WebSocket, i18n, themes, ecrans et rendu.
import { THEMES } from './themes.js';
import { drawGame } from './render.js';
import { I18N } from './lang.js';
import { Sound } from './sound.js';

// Toute erreur JS devient visible a l'ecran (utile pour debugger a distance sur Safari/mobile).
window.addEventListener('error', (e) => showErr('JS: ' + e.message));
window.addEventListener('unhandledrejection', (e) => showErr('Promise: ' + (e.reason?.message || e.reason)));
function showErr(msg) { const b = document.getElementById('errbar'); if (b) { b.textContent = '⚠ ' + msg; b.hidden = false; } }

const $ = (id) => document.getElementById(id);
const screens = { home: $('home'), lobby: $('lobby'), game: $('game') };
function show(name) { for (const k in screens) screens[k].hidden = k !== name; }

// ---- Preferences persistees ----
let myName = localStorage.getItem('kaboom_name') || '';
let themeKey = localStorage.getItem('kaboom_theme') || 'neon';
let lang = localStorage.getItem('kaboom_lang') || (navigator.language?.startsWith('en') ? 'en' : 'fr');
if (!THEMES[themeKey]) themeKey = 'neon';
if (!I18N[lang]) lang = 'fr';
$('name').value = myName;

// ---- Son ----
const sound = new Sound();
let soundOn = localStorage.getItem('kaboom_sound') !== 'off';
sound.enabled = soundOn;
let prevPhase = '', prevExpl = 0, prevBombs = 0, prevRange = 0;
function updateSoundBtn() { $('soundBtn').textContent = soundOn ? '🔊' : '🔇'; }
$('soundBtn').onclick = () => { soundOn = !soundOn; localStorage.setItem('kaboom_sound', soundOn ? 'on' : 'off'); sound.setEnabled(soundOn); updateSoundBtn(); };
// L'audio ne peut demarrer qu'apres un geste utilisateur
window.addEventListener('pointerdown', () => { sound.resume(); if (soundOn) sound.startMusic(); }, { once: true });
function plant() { send({ t: 'plant' }); sound.blip(); }

const t = (key) => (I18N[lang] && I18N[lang][key]) || key;

// ---- Etat client ----
let ws, wsReady = false, myId = null, room = null;
let state = null;
const outbox = [];              // messages en attente tant que la socket n'est pas ouverte
const view = {};
const keys = {};
let lastInput = { ax: 0, ay: 0 };

// ---- Connexion WebSocket (avec file d'attente + reconnexion) ----
function connect() {
  setConn('connecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    wsReady = true; setConn('connected');
    if (myName) rawSend({ t: 'setName', name: myName });
    while (outbox.length) rawSend(outbox.shift()); // on vide la file accumulee avant l'ouverture
    const code = new URLSearchParams(location.search).get('room');
    if (code) $('joinCode').value = code.toUpperCase();
  };
  ws.onmessage = (ev) => { try { handle(JSON.parse(ev.data)); } catch (e) { showErr(e.message); } };
  ws.onclose = () => { wsReady = false; setConn('offline'); setTimeout(connect, 1000); };
  ws.onerror = () => setConn('offline');
}
function rawSend(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
// send() ne perd JAMAIS un clic : si la socket n'est pas prete, le message attend et part a l'ouverture.
function send(obj) { if (wsReady) rawSend(obj); else outbox.push(obj); }

function setConn(kind) {
  const d = $('connDot'); if (!d) return;
  d.className = 'conn ' + kind;
  d.title = t(kind === 'connected' ? 'connected' : kind === 'offline' ? 'offline' : 'connecting');
}

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
    case 'start': show('game'); break;
    case 'state': state = m.s; break;
    case 'error': toast(m.code === 'noroom' ? t('errNoRoom') : m.code === 'full' ? t('errFull') : (m.msg || 'error')); break;
  }
}

// ---- i18n : applique la langue a tous les elements [data-i18n] ----
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  buildLangPicker();
  if (room) renderLobbyButtons();
}

// ---- Theme : applique les couleurs a TOUTE la page (variables CSS) + au canvas ----
function applyTheme() {
  const ui = THEMES[themeKey].ui;
  const root = document.documentElement.style;
  root.setProperty('--bg', ui.bg); root.setProperty('--panel', ui.panel);
  root.setProperty('--panel2', ui.panel2); root.setProperty('--line', ui.line);
  root.setProperty('--text', ui.text); root.setProperty('--muted', ui.muted);
  root.setProperty('--accent', ui.accent); root.setProperty('--accent2', ui.accent2);
  root.setProperty('--on-accent', ui.onAccent); root.setProperty('--font', ui.fontFamily);
  buildThemePicker();
}

function buildThemePicker() {
  const box = $('themePicker'); box.innerHTML = '';
  for (const key in THEMES) {
    const b = document.createElement('button');
    b.className = 'chip' + (key === themeKey ? ' active' : '');
    b.textContent = THEMES[key].label;
    b.onclick = () => { themeKey = key; localStorage.setItem('kaboom_theme', key); applyTheme(); };
    box.appendChild(b);
  }
}
function buildLangPicker() {
  const box = $('langPicker'); box.innerHTML = '';
  for (const key of ['fr', 'en']) {
    const b = document.createElement('button');
    b.className = 'chip' + (key === lang ? ' active' : '');
    b.textContent = key.toUpperCase();
    b.onclick = () => { lang = key; localStorage.setItem('kaboom_lang', key); applyLang(); };
    box.appendChild(b);
  }
}

// ---- Accueil ----
function renderRooms(list) {
  const box = $('rooms');
  if (!list.length) { box.innerHTML = `<p class="muted">${t('noGames')}</p>`; return; }
  box.innerHTML = '';
  for (const r of list) {
    const el = document.createElement('button');
    el.className = 'room';
    el.innerHTML = `<span class="rname">${esc(r.name)}</span>
      <span class="rmeta">${r.players}/${r.max}</span>`;
    el.onclick = () => joinRoom(r.code);
    box.appendChild(el);
  }
}
function joinRoom(code) {
  const n = ($('name').value || '').trim();
  if (!n) return toast(t('needNick'));
  saveName(n);
  send({ t: 'join', code, name: n });
}
$('createBtn').onclick = () => {
  const n = ($('name').value || '').trim();
  if (!n) return toast(t('needNick'));
  saveName(n);
  send({ t: 'create', name: n, roomName: ($('roomName').value || '').trim(), max: Number($('maxPlayers').value), private: $('isPrivate').checked });
};
$('joinBtn').onclick = () => {
  const code = ($('joinCode').value || '').trim().toUpperCase();
  if (!code) return toast(t('needCode'));
  joinRoom(code);
};
function saveName(n) { myName = n; localStorage.setItem('kaboom_name', n); send({ t: 'setName', name: n }); }

// ---- Lobby ----
let lobbyPlayers = 0;
function renderLobby(m) {
  room = { code: m.code, phase: m.phase };
  lobbyPlayers = m.players.length;
  $('lobbyName').textContent = m.name;
  $('lobbyCode').textContent = m.code;
  $('shareLink').value = `${location.origin}?room=${m.code}`;
  const box = $('lobbyPlayers'); box.innerHTML = '';
  for (const p of m.players) {
    const el = document.createElement('div'); el.className = 'plobby';
    el.innerHTML = `<span class="dot" style="background:${p.color}"></span>${esc(p.name)}`;
    box.appendChild(el);
  }
  renderLobbyButtons();
}
function renderLobbyButtons() {
  $('startBtn').textContent = lobbyPlayers < 2 ? t('startSolo') : `${t('start')} (${lobbyPlayers})`;
}
$('startBtn').onclick = () => send({ t: 'start' });
$('leaveBtn').onclick = () => { send({ t: 'leave' }); room = null; history.replaceState(null, '', location.pathname); show('home'); };
$('copyLink').onclick = () => { $('shareLink').select(); navigator.clipboard?.writeText($('shareLink').value); toast(t('copied')); };

// ---- Entrees clavier ----
window.addEventListener('keydown', (e) => {
  if (screens.game.hidden) return;
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); plant(); return; }
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
  const on = (e) => { e.preventDefault(); lastInput = { ax, ay }; send({ t: 'input', ax, ay }); };
  const off = (e) => { e.preventDefault(); lastInput = { ax: 0, ay: 0 }; send({ t: 'input', ax: 0, ay: 0 }); };
  el.addEventListener('touchstart', on); el.addEventListener('touchend', off);
  el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
}
bindTouch('padUp', 0, -1); bindTouch('padDown', 0, 1); bindTouch('padLeft', -1, 0); bindTouch('padRight', 1, 0);
for (const ev of ['touchstart', 'mousedown']) $('padBomb').addEventListener(ev, (e) => { e.preventDefault(); plant(); });

// ---- Boucle de rendu ----
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const tile = 34;
function loop() {
  requestAnimationFrame(loop);
  if (screens.game.hidden || !state) return;
  const theme = THEMES[themeKey];
  const W = state.cols * tile, H = state.rows * tile;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  for (const p of state.players) {
    if (!view[p.id]) view[p.id] = { x: p.x, y: p.y };
    view[p.id].x += (p.x - view[p.id].x) * 0.35;
    view[p.id].y += (p.y - view[p.id].y) * 0.35;
  }
  for (const id in view) if (!state.players.find(p => p.id == id)) delete view[id];
  drawGame(ctx, state, view, theme, tile);
  // SFX explosion : une salve apparait (le nombre de flammes augmente)
  if (state.explosions.length > prevExpl) sound.boom();
  prevExpl = state.explosions.length;
  updateHud();
}
function updateHud() {
  const alive = state.players.filter(p => p.alive && !p.ghost).length;
  const sd = state.suddenDeathIn;
  $('hudAlive').textContent = `${alive} ${t('alive')}`;
  $('hudTimer').textContent = sd > 0 ? `${t('suddenIn')} ${Math.ceil(sd)}s` : t('suddenNow');
  $('hudTimer').classList.toggle('danger', sd <= 0 || sd < 10);
  const me = state.players.find(p => p.id == myId);
  $('hudStats').textContent = me ? `💣 ${me.bombs}  ✳ ${me.range}` : '';
  // SFX ramassage de power-up (mes stats augmentent)
  if (me) {
    if (prevBombs && (me.bombs > prevBombs || me.range > prevRange)) sound.pickup();
    prevBombs = me.bombs; prevRange = me.range;
  }
  // SFX fin de manche
  if (state.phase !== prevPhase) {
    if (state.phase === 'over') (state.winner && state.winner.id == myId) ? sound.win() : sound.lose();
    prevPhase = state.phase;
  }
  const over = $('overlay');
  if (state.phase === 'over') {
    over.hidden = false;
    $('overTitle').textContent = state.winner ? `🏆 ${state.winner.name} ${t('wins')}` : t('draw');
    $('overSub').textContent = `${t('newRound')} ${Math.ceil(state.restartIn)}s`;
  } else over.hidden = true;
}

// ---- Utils ----
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
let toastTimer;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2500); }

// ---- Demarrage ----
applyTheme();
applyLang();
updateSoundBtn();
connect();
loop();
