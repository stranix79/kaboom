// game.js - toute la logique d'une partie Kaboom.
// Le serveur est AUTORITATIF : il simule la partie et envoie l'etat aux clients.
// Les coordonnees sont en "tuiles" (1 = une case). Le client multiplie par TILE (px).

// ---- Constantes de jeu (faciles a retoucher pour equilibrer) ----
export const COLS = 15;              // largeur de l'arene en cases (impair = joli quadrillage)
export const ROWS = 13;              // hauteur
const PLAYER_SPEED = 4.2;            // vitesse de base en cases/seconde
const SPEED_STEP = 0.9;             // bonus par power-up vitesse
const PLAYER_HALF = 0.34;            // demi-taille du joueur (collision)
const BOMB_TIMER = 2.4;              // secondes avant explosion
const EXPLOSION_TTL = 0.5;           // duree d'affichage/danger d'une flamme
const BASE_RANGE = 2;                // portee initiale du souffle
const BLOCK_DENSITY = 0.78;          // proba qu'une case libre recoive un bloc destructible
const POWERUP_CHANCE = 0.32;         // proba qu'un bloc detruit lache un power-up
const SUDDEN_DEATH = 55;             // secondes avant que l'arene commence a s'effondrer
const COLLAPSE_INTERVAL = 0.35;      // temps entre deux cases murees pendant la mort subite
const GHOST_COOLDOWN = 5.5;          // secondes entre deux bombes-pieges d'un fantome
const GHOST_SPEED = 5.0;             // les fantomes flottent un peu plus vite
const RESTART_DELAY = 5;             // secondes d'affichage du gagnant avant relance

// Palette de couleurs des joueurs (indice de slot -> couleur logique, le theme client la reinterprete)
export const PLAYER_COLORS = ['#00ff9c', '#ff5c8a', '#4db5ff', '#ffd23f', '#b388ff', '#ff8c42', '#5affaf', '#ff5555'];

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const r2 = (n) => Math.round(n * 100) / 100; // arrondi 2 decimales pour alleger le reseau

export class Game {
  constructor(playerIds) {
    // playerIds : Map<id, {name, color}> des joueurs presents au lancement
    this.grid = [];
    this.bombs = [];
    this.explosions = [];
    this.powerups = [];
    this.players = new Map();
    this.time = 0;
    this.phase = 'playing';     // 'playing' | 'over'
    this.winner = null;
    this.restartAt = 0;
    this.spiral = buildSpiral();
    this.collapsedTo = -1;

    for (const [id, info] of playerIds) {
      this.addPlayer(id, info.name, info.color, false);
    }
    this.aliveAtStart = [...this.players.values()].filter(p => !p.ghost).length;
    this.resetRound(true);
  }

  addPlayer(id, name, color, spectator) {
    const p = {
      id, name, color,
      x: 1.5, y: 1.5, dir: 'down',
      alive: !spectator, ghost: spectator,
      maxBombs: 1, range: BASE_RANGE, speed: PLAYER_SPEED, speedBonus: 0,
      activeBombs: 0,
      input: { ax: 0, ay: 0 },
      phasing: new Set(),      // bombes que le joueur traverse encore (celle qu'il vient de poser)
      plantQueued: false,
      lastGhostBomb: -999,
      wins: 0,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) for (const b of this.bombs) if (b.owner === id) b.owner = null;
    this.players.delete(id);
  }

  // Un joueur arrivant en cours de manche : fantome spectateur, il jouera vraiment a la manche suivante.
  joinMidGame(id, name, color) {
    if (this.players.has(id)) return;
    this.addPlayer(id, name, color, true);
  }

  resetRound(firstRound = false) {
    this.grid = buildGrid();
    this.bombs = [];
    this.explosions = [];
    this.powerups = [];
    this.time = 0;
    this.collapsedTo = -1;
    this.phase = 'playing';
    this.winner = null;

    const spawns = [
      [1, 1], [COLS - 2, ROWS - 2], [COLS - 2, 1], [1, ROWS - 2],
      [Math.floor(COLS / 2), 1], [Math.floor(COLS / 2), ROWS - 2],
      [1, Math.floor(ROWS / 2)], [COLS - 2, Math.floor(ROWS / 2)],
    ];
    let i = 0;
    for (const p of this.players.values()) {
      const [c, r] = spawns[i % spawns.length];
      i++;
      p.x = c + 0.5; p.y = r + 0.5; p.dir = 'down';
      p.alive = true; p.ghost = false;
      p.maxBombs = 1; p.range = BASE_RANGE; p.speed = PLAYER_SPEED; p.speedBonus = 0;
      p.activeBombs = 0; p.input = { ax: 0, ay: 0 };
      p.phasing = new Set(); p.plantQueued = false; p.lastGhostBomb = -999;
    }
    this.aliveAtStart = this.players.size;
  }

  setInput(id, ax, ay) {
    const p = this.players.get(id);
    if (!p) return;
    p.input.ax = Math.sign(ax);
    p.input.ay = Math.sign(ay);
  }

  queuePlant(id) {
    const p = this.players.get(id);
    if (p) p.plantQueued = true;
  }

  // ---- Boucle de simulation : appelee ~20x/seconde ----
  tick(dt) {
    if (this.phase === 'over') return;
    this.time += dt;

    for (const p of this.players.values()) {
      if (p.ghost) this.updateGhost(p, dt);
      else if (p.alive) this.updatePlayer(p, dt);
      p.plantQueued = false;
    }

    // Bombes
    for (const b of this.bombs) {
      b.timer -= dt;
      if (b.timer <= 0 && !b.done) this.detonate(b);
    }
    this.bombs = this.bombs.filter(b => !b.done);

    // Flammes
    for (const e of this.explosions) e.ttl -= dt;
    this.explosions = this.explosions.filter(e => e.ttl > 0);

    // Danger des flammes encore actives : tue un joueur vivant qui s'y trouve
    for (const e of this.explosions) this.killAt(e.c, e.r);

    // Mort subite : on mure l'arene en spirale
    if (this.time >= SUDDEN_DEATH) {
      const target = Math.floor((this.time - SUDDEN_DEATH) / COLLAPSE_INTERVAL);
      while (this.collapsedTo < target && this.collapsedTo < this.spiral.length - 1) {
        this.collapsedTo++;
        const [c, r] = this.spiral[this.collapsedTo];
        this.grid[r][c] = 1;
        this.powerups = this.powerups.filter(pu => pu.c !== c || pu.r !== r);
        this.bombs = this.bombs.filter(b => b.c !== c || b.r !== r);
        this.crushAt(c, r);
      }
    }

    this.checkRoundEnd();
  }

  updatePlayer(p, dt) {
    p.speed = PLAYER_SPEED; // recalcule via power-ups appliques ci-dessous
    if (p.input.ax) p.dir = p.input.ax > 0 ? 'right' : 'left';
    else if (p.input.ay) p.dir = p.input.ay > 0 ? 'down' : 'up';

    const v = p.speed + (p.speedBonus || 0);
    if (p.input.ax) this.moveAxis(p, 'x', p.input.ax * v * dt);
    if (p.input.ay) this.moveAxis(p, 'y', p.input.ay * v * dt);

    // On arrete de traverser une bombe des qu'on n'est plus dessus
    for (const key of [...p.phasing]) {
      const [bc, br] = key.split(',').map(Number);
      if (!this.overlapsTile(p, bc, br)) p.phasing.delete(key);
    }

    // Ramasse un power-up
    const c = Math.floor(p.x), r = Math.floor(p.y);
    const idx = this.powerups.findIndex(pu => pu.c === c && pu.r === r);
    if (idx >= 0) { this.applyPowerup(p, this.powerups[idx].type); this.powerups.splice(idx, 1); }

    // Pose une bombe
    if (p.plantQueued) this.plantBomb(p, c, r);
  }

  updateGhost(p, dt) {
    if (p.input.ax) p.dir = p.input.ax > 0 ? 'right' : 'left';
    else if (p.input.ay) p.dir = p.input.ay > 0 ? 'down' : 'up';
    // Le fantome flotte librement (ignore murs et blocs), borne a l'arene
    p.x = clamp(p.x + p.input.ax * GHOST_SPEED * dt, 0.5, COLS - 0.5);
    p.y = clamp(p.y + p.input.ay * GHOST_SPEED * dt, 0.5, ROWS - 0.5);
    // Bombe-piege sur cooldown : la vengeance des morts
    if (p.plantQueued && this.time - p.lastGhostBomb >= GHOST_COOLDOWN) {
      const c = Math.floor(p.x), r = Math.floor(p.y);
      if (this.grid[r][c] === 0 && !this.bombs.some(b => b.c === c && b.r === r)) {
        this.bombs.push({ c, r, owner: p.id, timer: BOMB_TIMER, range: 2, ghost: true, done: false });
        p.lastGhostBomb = this.time;
      }
    }
  }

  moveAxis(p, axis, delta) {
    const h = PLAYER_HALF;
    let nx = p.x, ny = p.y;
    if (axis === 'x') nx += delta; else ny += delta;
    const minC = Math.floor(nx - h), maxC = Math.floor(nx + h);
    const minR = Math.floor(ny - h), maxR = Math.floor(ny + h);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (this.blockedForPlayer(p, c, r)) {
          if (axis === 'x') nx = delta > 0 ? c - h - 1e-3 : c + 1 + h + 1e-3;
          else ny = delta > 0 ? r - h - 1e-3 : r + 1 + h + 1e-3;
        }
      }
    }
    p.x = nx; p.y = ny;
  }

  blockedForPlayer(p, c, r) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    if (this.grid[r][c] !== 0) return true;
    const bomb = this.bombs.find(b => b.c === c && b.r === r && !b.done);
    if (bomb && !p.phasing.has(c + ',' + r)) return true;
    return false;
  }

  overlapsTile(p, c, r) {
    const h = PLAYER_HALF;
    return p.x + h > c && p.x - h < c + 1 && p.y + h > r && p.y - h < r + 1;
  }

  plantBomb(p, c, r) {
    if (p.activeBombs >= p.maxBombs) return;
    if (this.grid[r][c] !== 0) return;
    if (this.bombs.some(b => b.c === c && b.r === r && !b.done)) return;
    this.bombs.push({ c, r, owner: p.id, timer: BOMB_TIMER, range: p.range, ghost: false, done: false });
    p.activeBombs++;
    p.phasing.add(c + ',' + r); // le poseur peut sortir de sa propre bombe
  }

  detonate(b) {
    if (b.done) return;
    b.done = true;
    this.addExplosion(b.c, b.r);
    for (const [dc, dr] of DIRS) {
      for (let i = 1; i <= b.range; i++) {
        const c = b.c + dc * i, r = b.r + dr * i;
        const cell = this.grid[r]?.[c];
        if (cell === undefined || cell === 1) break;      // mur plein : le souffle est stoppe
        this.addExplosion(c, r);
        if (cell === 2) { this.grid[r][c] = 0; this.maybeSpawnPowerup(c, r); break; } // bloc detruit, stop
        const other = this.bombs.find(o => !o.done && o.c === c && o.r === r);
        if (other) this.detonate(other);                  // reaction en chaine
      }
    }
    const owner = this.players.get(b.owner);
    if (owner && !b.ghost) owner.activeBombs = Math.max(0, owner.activeBombs - 1);
  }

  addExplosion(c, r) {
    this.explosions.push({ c, r, ttl: EXPLOSION_TTL });
    this.killAt(c, r); // effet immediat : ce qui est deja sur la case meurt
  }

  killAt(c, r) {
    for (const p of this.players.values()) {
      if (p.alive && !p.ghost && Math.floor(p.x) === c && Math.floor(p.y) === r) this.kill(p);
    }
  }

  crushAt(c, r) { // ecrasement par le mur de la mort subite (touche aussi les fantomes)
    for (const p of this.players.values()) {
      if ((p.alive || p.ghost) && Math.floor(p.x) === c && Math.floor(p.y) === r) {
        if (p.ghost) this.players.delete(p.id); else this.kill(p);
      }
    }
  }

  kill(p) {
    p.alive = false;
    p.ghost = true;
    p.lastGhostBomb = this.time - GHOST_COOLDOWN + 2; // petit delai avant sa 1re vengeance
  }

  applyPowerup(p, type) {
    if (type === 'bomb') p.maxBombs++;
    else if (type === 'fire') p.range++;
    else if (type === 'speed') p.speedBonus = (p.speedBonus || 0) + SPEED_STEP;
  }

  maybeSpawnPowerup(c, r) {
    if (Math.random() > POWERUP_CHANCE) return;
    const roll = Math.random();
    const type = roll < 0.4 ? 'bomb' : roll < 0.75 ? 'fire' : 'speed';
    this.powerups.push({ c, r, type });
  }

  checkRoundEnd() {
    const living = [...this.players.values()].filter(p => p.alive && !p.ghost);
    const soloPractice = this.aliveAtStart <= 1;
    const ended = soloPractice ? living.length === 0 : living.length <= 1;
    if (!ended) return;
    this.phase = 'over';
    this.winner = living.length === 1 ? { id: living[0].id, name: living[0].name } : null;
    if (this.winner) { const w = this.players.get(this.winner.id); if (w) w.wins++; }
    this.restartAt = Date.now() + RESTART_DELAY * 1000;
  }

  maybeRestart() {
    if (this.phase === 'over' && Date.now() >= this.restartAt) this.resetRound();
  }

  // ---- Serialisation envoyee aux clients ----
  serialize() {
    let flat = '';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) flat += this.grid[r][c];
    return {
      phase: this.phase,
      time: r2(this.time),
      suddenDeathIn: r2(Math.max(0, SUDDEN_DEATH - this.time)),
      grid: flat,
      cols: COLS, rows: ROWS,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color,
        x: r2(p.x), y: r2(p.y), dir: p.dir,
        alive: p.alive, ghost: p.ghost,
        bombs: p.maxBombs, range: p.range, wins: p.wins,
      })),
      bombs: this.bombs.filter(b => !b.done).map(b => ({ c: b.c, r: b.r, timer: r2(b.timer), ghost: b.ghost })),
      explosions: this.explosions.map(e => ({ c: e.c, r: e.r })),
      powerups: this.powerups.map(pu => ({ c: pu.c, r: pu.r, type: pu.type })),
      winner: this.winner,
      restartIn: this.phase === 'over' ? r2(Math.max(0, (this.restartAt - Date.now()) / 1000)) : 0,
    };
  }
}

// ---- Construction du terrain ----
function buildGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      let cell = 0;
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) cell = 1;       // bordure pleine
      else if (r % 2 === 0 && c % 2 === 0) cell = 1;                              // piliers
      else if (Math.random() < BLOCK_DENSITY) cell = 2;                           // blocs destructibles
      row.push(cell);
    }
    g.push(row);
  }
  // Degage les coins de spawn et leurs voisins pour ne pas pieger les joueurs
  const corners = [[1, 1], [COLS - 2, 1], [1, ROWS - 2], [COLS - 2, ROWS - 2],
    [Math.floor(COLS / 2), 1], [Math.floor(COLS / 2), ROWS - 2], [1, Math.floor(ROWS / 2)], [COLS - 2, Math.floor(ROWS / 2)]];
  for (const [c, r] of corners) {
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (g[rr] && g[rr][cc] === 2) g[rr][cc] = 0;
    }
  }
  return g;
}

// Ordre en spirale (exterieur -> centre) pour la mort subite
function buildSpiral() {
  const order = [];
  let top = 0, bottom = ROWS - 1, left = 0, right = COLS - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) order.push([c, top]);
    for (let r = top + 1; r <= bottom; r++) order.push([right, r]);
    if (top < bottom) for (let c = right - 1; c >= left; c--) order.push([c, bottom]);
    if (left < right) for (let r = bottom - 1; r > top; r--) order.push([left, r]);
    top++; bottom--; left++; right--;
  }
  return order;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
