// server.js - point d'entree. Sert le client statique + pilote les WebSockets et les rooms.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game, PLAYER_COLORS, MAPS, autoSize } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;
const TICK_HZ = 20;

// ---- Serveur HTTP : fichiers statiques du dossier public/ ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- Etat global ----
const wss = new WebSocketServer({ server });
const rooms = new Map();   // code -> Room
let clientSeq = 0;

class Room {
  constructor(code, name, max, isPrivate, size) {
    this.code = code;
    this.name = name;
    this.max = Math.min(Math.max(max, 2), 8);
    this.private = !!isPrivate;
    this.size = (size && size !== 'auto' && MAPS[size]) ? size : autoSize(this.max); // 'auto' -> selon le nb de joueurs
    this.phase = 'lobby';   // 'lobby' | 'playing'
    this.members = new Map(); // clientId -> { ws, name, color }
    this.game = null;
    this.scores = new Map();  // clientId -> victoires cumulees (persistent entre manches)
    this.chat = [];           // dernieres lignes de chat
    this.lastResult = null;   // { name } du gagnant de la derniere manche
    this.overSince = 0;       // horodatage de fin de manche (pour l'affichage du gagnant avant retour lobby)
  }
  colorFor() {
    const used = new Set([...this.members.values()].map(m => m.color));
    return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0];
  }
  isFull() { return this.members.size >= this.max; }
  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const m of this.members.values()) if (m.ws.readyState === 1) m.ws.send(msg);
  }
  lobbyState() {
    return {
      t: 'lobby', code: this.code, name: this.name, max: this.max, private: this.private, phase: this.phase, size: this.size,
      players: [...this.members].map(([id, m]) => ({ name: m.name, color: m.color, wins: this.scores.get(id) || 0 })),
      dims: MAPS[this.size] ? { cols: MAPS[this.size].cols, rows: MAPS[this.size].rows } : null,
      lastResult: this.lastResult,
      chat: this.chat.slice(-40),
    };
  }
}

function makeCode() {
  let code;
  do { code = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms.has(code));
  return code;
}

function publicRoomList() {
  return {
    t: 'rooms',
    list: [...rooms.values()].filter(r => !r.private).map(r => ({
      code: r.code, name: r.name, players: r.members.size, max: r.max, phase: r.phase,
    })),
  };
}

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  room.members.delete(client.id);
  if (room.game) room.game.removePlayer(client.id);
  client.room = null;
  if (room.members.size === 0) rooms.delete(room.code);
  else room.broadcast(room.lobbyState());
  broadcastRoomList();
}

function broadcastRoomList() {
  const msg = JSON.stringify(publicRoomList());
  for (const c of wss.clients) if (c.readyState === 1 && !c._client.room) c.send(msg);
}

wss.on('connection', (ws) => {
  const client = { id: ++clientSeq, ws, name: 'Player', room: null };
  ws._client = client;
  send(ws, { t: 'hello', id: client.id });
  send(ws, publicRoomList());

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'setName':
        client.name = String(m.name || 'Player').slice(0, 16) || 'Player';
        break;

      case 'listRooms':
        send(ws, publicRoomList());
        break;

      case 'create': {
        if (client.room) leaveRoom(client);
        client.name = String(m.name || client.name).slice(0, 16) || 'Player';
        const room = new Room(makeCode(), String(m.roomName || 'Arene').slice(0, 24) || 'Arene', Number(m.max) || 4, m.private, m.size);
        rooms.set(room.code, room);
        joinRoom(client, room);
        break;
      }

      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) return send(ws, { t: 'error', code: 'noroom' });
        if (room.isFull()) return send(ws, { t: 'error', code: 'full' });
        if (client.room) leaveRoom(client);
        client.name = String(m.name || client.name).slice(0, 16) || 'Player';
        joinRoom(client, room);
        break;
      }

      case 'start': {
        const room = client.room;
        if (!room || room.phase === 'playing') return;
        const ids = new Map([...room.members].map(([id, info]) => [id, { name: info.name, color: info.color }]));
        const dim = MAPS[room.size] || MAPS.m;
        room.game = new Game(ids, dim.cols, dim.rows);
        room.phase = 'playing';
        room.broadcast({ t: 'start' });
        broadcastRoomList();
        break;
      }

      case 'input': {
        const room = client.room;
        if (room?.game) room.game.setInput(client.id, m.ax || 0, m.ay || 0);
        break;
      }

      case 'plant': {
        const room = client.room;
        if (room?.game) room.game.queuePlant(client.id);
        break;
      }

      case 'chat': {
        const room = client.room;
        const text = String(m.text || '').slice(0, 200).trim();
        if (!room || !text) break;
        const info = room.members.get(client.id);
        const line = { name: info?.name || client.name, color: info?.color || '#fff', text, ts: Date.now() };
        room.chat.push(line);
        if (room.chat.length > 60) room.chat.shift();
        room.broadcast({ t: 'chat', line });
        break;
      }

      case 'taunt': {
        const room = client.room;
        if (!room?.game) break;
        const info = room.members.get(client.id);
        room.broadcast({ t: 'taunt', name: info?.name || client.name, color: info?.color || '#fff' });
        break;
      }

      case 'leave':
        leaveRoom(client);
        send(ws, publicRoomList());
        break;
    }
  });

  ws.on('close', () => leaveRoom(client));
  ws.on('error', () => {});
});

function joinRoom(client, room) {
  const color = room.colorFor();
  room.members.set(client.id, { ws: client.ws, name: client.name, color });
  if (!room.scores.has(client.id)) room.scores.set(client.id, 0);
  client.room = room;
  send(client.ws, { t: 'joined', code: room.code, you: client.id, phase: room.phase });
  room.broadcast(room.lobbyState());
  broadcastRoomList();
  // Rejoint en cours de partie : spectateur/fantome, jouera vraiment a la prochaine manche
  if (room.game) room.game.joinMidGame(client.id, client.name, color);
}

// ---- Boucle globale : simule chaque room en jeu et diffuse l'etat ----
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const room of rooms.values()) {
    if (room.phase !== 'playing' || !room.game) continue;
    room.game.tick(dt);
    room.broadcast({ t: 'state', s: room.game.serialize() });
    // Fin de manche : on montre le gagnant ~3,5 s puis retour au lobby (pas de restart auto).
    if (room.game.phase === 'over') {
      if (!room.overSince) {
        room.overSince = now;
        const w = room.game.winner;
        if (w) room.scores.set(w.id, (room.scores.get(w.id) || 0) + 1);
        room.lastResult = w ? { name: w.name } : { name: null };
      } else if (now - room.overSince >= 3500) {
        room.game = null;
        room.phase = 'lobby';
        room.overSince = 0;
        room.broadcast(room.lobbyState());
        broadcastRoomList();
      }
    }
  }
}, 1000 / TICK_HZ);

// Rafraichit la liste des rooms pour les visiteurs de l'accueil
setInterval(broadcastRoomList, 2000);

server.listen(PORT, () => console.log(`Kaboom en ecoute sur http://localhost:${PORT}`));
