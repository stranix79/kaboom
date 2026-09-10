// client.js - connexion WebSocket, i18n, themes, ecrans et rendu.
import { THEMES } from './themes.js';
import { drawGame } from './render.js';
import { I18N } from './lang.js';
import { Sound } from './sound.js';
import { Attract } from './attract.js';

// Toute erreur JS devient visible a l'ecran (utile pour debugger a distance sur Safari/mobile).
window.addEventListener('error', (e) => showErr('JS: ' + e.message));
window.addEventListener('unhandledrejection', (e) => showErr('Promise: ' + (e.reason?.message || e.reason)));
function showErr(msg) { const b = document.getElementById('errbar'); if (b) { b.textContent = '⚠ ' + msg; b.hidden = false; } }

const $ = (id) => document.getElementById(id);
const screens = { home: $('home'), lobby: $('lobby'), game: $('game') };
const attract = new Attract('bg'); // fond animé de l'accueil
function show(name) {
  for (const k in screens) screens[k].hidden = k !== name;
  // Fond animé sur l'accueil ET le lobby/chat ; coupé seulement en pleine partie.
  if (name === 'game') attract.stop(); else attract.start();
}

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
// Le bouton coupe/active la MUSIQUE uniquement (les bruitages et le rire restent).
function updateSoundBtn() { const b = $('soundBtn'); b.textContent = soundOn ? '🎵' : '🔇'; b.title = soundOn ? 'musique on' : 'musique off'; }
$('soundBtn').onclick = () => { soundOn = !soundOn; localStorage.setItem('kaboom_sound', soundOn ? 'on' : 'off'); sound.setMusic(soundOn); updateSoundBtn(); };
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
// Effets visuels (juice) : fantomes qui montent, etincelles, confettis + secousse d'ecran
const fx = [];
let shake = 0, lastT = performance.now();
const prevGhost = {};

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
    case 'lobby': renderLobby(m); if (m.phase === 'lobby' && !screens.game.hidden) { state = null; show('lobby'); } break;
    case 'chat': addChatLine(m.line); break;
    case 'start': for (const k in prevGhost) delete prevGhost[k]; fx.length = 0; show('game'); break;
    case 'state': state = m.s; break;
    case 'taunt': sound.laugh(); showTaunt(m.name, m.color); break;
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
  attract.setColors(THEMES[themeKey]);
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
  send({ t: 'create', name: n, roomName: ($('roomName').value || '').trim(), max: Number($('maxPlayers').value), size: $('mapSize').value, private: $('isPrivate').checked });
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
  $('lobbySize').textContent = m.dims ? `${t('mapSize')} : ${m.dims.cols} × ${m.dims.rows}` : '';
  const box = $('lobbyPlayers'); box.innerHTML = '';
  for (const p of [...m.players].sort((a, b) => (b.wins || 0) - (a.wins || 0))) {
    const el = document.createElement('div'); el.className = 'plobby';
    el.innerHTML = `<span class="dot" style="background:${p.color}"></span><span class="pn">${esc(p.name)}</span>` +
      (p.wins ? `<span class="wins">🏆 ${p.wins}</span>` : '');
    box.appendChild(el);
  }
  const res = $('lobbyResult');
  if (m.lastResult) { res.hidden = false; res.textContent = m.lastResult.name ? `🏆 ${m.lastResult.name} ${t('roundWin')}` : t('roundDraw'); }
  else res.hidden = true;
  const log = $('chatLog'); log.innerHTML = '';
  for (const l of (m.chat || [])) addChatLine(l);
  renderLobbyButtons();
}
function addChatLine(l) {
  const log = $('chatLog');
  const el = document.createElement('div'); el.className = 'chatline';
  const time = l.ts ? new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  el.innerHTML = `<span class="chattime">${time}</span> <b style="color:${l.color}">${esc(l.name)}</b> ${esc(l.text)}`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}
// Barre d'emoji rapide pour le chat
const EMOJIS = ['😂', '🤣', '😈', '💣', '🔥', '👻', '💀', '🎉', '😱', '😎', '👍', '❤️', '🤡', '🙃', '😭', '🫡'];
function buildEmojiBar() {
  const bar = $('emojiBar'); bar.innerHTML = '';
  for (const e of EMOJIS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'emoji'; b.textContent = e;
    b.onclick = () => { const inp = $('chatInput'); inp.value += e; inp.focus(); };
    bar.appendChild(b);
  }
}
$('emojiBtn').onclick = () => { const bar = $('emojiBar'); bar.hidden = !bar.hidden; };
buildEmojiBar();
function sendChat() {
  const inp = $('chatInput'); const txt = (inp.value || '').trim();
  if (!txt) return; send({ t: 'chat', text: txt }); inp.value = '';
}
$('chatSend').onclick = sendChat;
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
function renderLobbyButtons() {
  $('startBtn').textContent = lobbyPlayers < 2 ? t('startSolo') : `${t('start')} (${lobbyPlayers})`;
}
$('startBtn').onclick = () => send({ t: 'start' });
function goHome() {
  send({ t: 'leave' });
  room = null; state = null; fx.length = 0;
  for (const k in view) delete view[k];
  for (const k in prevGhost) delete prevGhost[k];
  history.replaceState(null, '', location.pathname);
  show('home');
}
$('leaveBtn').onclick = goHome;   // dans le lobby : quitter la room -> accueil
// En jeu : "Quitter" ramene au LOBBY de la room (on y reste), pas a l'accueil.
function backToLobby() {
  send({ t: 'toLobby' });
  state = null; fx.length = 0;
  for (const k in view) delete view[k];
  for (const k in prevGhost) delete prevGhost[k];
  show('lobby');
}
$('quitBtn').onclick = backToLobby;
$('copyLink').onclick = () => { $('shareLink').select(); navigator.clipboard?.writeText($('shareLink').value); toast(t('copied')); };

// ---- Entrees clavier ----
window.addEventListener('keydown', (e) => {
  if (screens.game.hidden) return;
  if (e.code === 'Escape') { backToLobby(); return; }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); plant(); return; }
  if (e.code === 'KeyL') { send({ t: 'taunt' }); return; }
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

// Taunt : diffuse un rire glauque a tous les joueurs + visuel a l'ecran (pour ceux sans son)
$('tauntBtn').onclick = () => send({ t: 'taunt' });
let tauntTimer;
function showTaunt(name, color) {
  const el = $('tauntOverlay');
  el.innerHTML = `<div class="taunt-emo">😈</div><div class="taunt-name" style="color:${color}">${esc(name)} : HÉHÉHÉHÉ…</div>`;
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(tauntTimer); tauntTimer = setTimeout(() => { el.hidden = true; }, 1900);
}

// ---- Boucle de rendu ----
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const tile = 34;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(); const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
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
  // Detection de mort -> petit fantome qui monte au ciel
  for (const p of state.players) {
    if (prevGhost[p.id] === false && p.ghost) {
      const v = view[p.id] || p; spawnDeathGhost(v.x, v.y, p.color); spawnSparks(v.x, v.y, p.color, 10); shake = Math.max(shake, 5);
    }
    prevGhost[p.id] = p.ghost;
  }
  // Explosion -> son + secousse + etincelles
  if (state.explosions.length > prevExpl) {
    sound.boom(); shake = Math.max(shake, 7);
    const e = state.explosions[0]; if (e) spawnSparks(e.c + 0.5, e.r + 0.5, theme.explosion, 6);
  }
  prevExpl = state.explosions.length;
  // Rendu avec secousse d'ecran
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.86; } else shake = 0;
  drawGame(ctx, state, view, theme, tile);
  drawFx(dt, theme);
  ctx.restore();
  updateHud();
}

// ---- Particules ----
function drawFx(dt, theme) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    if (f.life <= 0) { fx.splice(i, 1); continue; }
    const a = Math.max(0, f.life / f.life0);
    if (f.type === 'ghost') {
      f.y += f.vy * dt; f.x += Math.sin(f.life * 6) * 0.012;
      const x = f.x * tile, y = f.y * tile, s = tile * 0.34;
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(x, y - 2, s, Math.PI, 0); ctx.lineTo(x + s, y + s * 0.9);
      for (let k = 0; k < 3; k++) ctx.lineTo(x + s - (k + 0.5) * s * 0.66, y + s * 0.9 - (k % 2 ? 0 : s * 0.3));
      ctx.lineTo(x - s, y + s * 0.9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b0b0b';
      ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.15, s * 0.15, 0, 7); ctx.arc(x + s * 0.3, y - s * 0.15, s * 0.15, 0, 7); ctx.fill();
      ctx.restore();
    } else if (f.type === 'spark') {
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 6 * dt;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.fillRect(f.x * tile - 2, f.y * tile - 2, 4, 4); ctx.restore();
    } else if (f.type === 'confetti') {
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 7 * dt; f.rot += f.vr * dt;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x * tile, f.y * tile); ctx.rotate(f.rot);
      ctx.fillStyle = f.color; ctx.fillRect(-3, -5, 6, 10); ctx.restore();
    }
  }
}
function spawnDeathGhost(x, y, color) { fx.push({ type: 'ghost', x, y, vy: -1.7, life: 1.4, life0: 1.4, color }); }
function spawnSparks(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = 1 + Math.random() * 3.5; fx.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, life0: 0.45, color }); } }
function spawnConfetti() {
  const cols = ['#00ff9c', '#ff5c8a', '#4db5ff', '#ffd23f', '#b388ff'];
  const w = state ? state.cols : 15;
  for (let i = 0; i < 80; i++) fx.push({ type: 'confetti', x: Math.random() * w, y: -Math.random() * 3, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 10, life: 2.6, life0: 2.6, color: cols[i % cols.length] });
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
  // Fin de manche : son + confettis pour le gagnant
  if (state.phase !== prevPhase) {
    if (state.phase === 'over') {
      if (state.winner && state.winner.id == myId) sound.win(); else sound.lose();
      if (state.winner) spawnConfetti();
    }
    prevPhase = state.phase;
  }
  const over = $('overlay');
  if (state.phase === 'over') {
    over.hidden = false;
    $('overTitle').textContent = state.winner ? `🏆 ${state.winner.name} ${t('wins')}` : t('draw');
    $('overSub').textContent = '';
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
attract.start();
connect();
loop();
window.kaboomSound = sound; // aide au diagnostic audio
// Version / build en bas a droite
fetch('/version.json').then(r => r.json()).then(v => { $('version').textContent = `v${v.version} · ${v.build} · ${v.date}`; }).catch(() => {});
