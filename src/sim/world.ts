import { cellAt, LAND, type GameMap, type Point } from "./map.ts";
import { distanceField } from "./flow.ts";
import { createRng, type Rng } from "./rng.ts";

/** What the player brings into a run, from research: how many turrets may stand and how strong each is. */
export interface Arsenal {
  capacity: number;
  turret: { range: number; damage: number; shotsPerSecond: number };
}

/** Simulation step in seconds. Fixed, so a run with the same seed replays exactly. */
export const DT = 1 / 30;

/** How often the route field is rebuilt from congestion (ticks). */
export const REROUTE_TICKS = 15;
/** Extra cost of a cell at full congestion, as a multiple of its length. */
const CONGESTION_COST = 6;
/** Weight of the newest load in the smoothed congestion; the rest is memory (hysteresis). */
const CONGESTION_SMOOTHING = 0.4;
/** Load (share of capacity) below which a cell counts as free flowing, not congested. */
const FREE_FLOW = 0.34;

export interface LevelDef {
  map: GameMap;
  enemies: {
    /** Enemies in the level. */
    count: number;
    /** Enemies per second out of the spawn. */
    perSecond: number;
    /** Hit points per enemy. */
    hp: number;
    /** Cells per second. */
    speed: number;
    /** Enemies one simulated blob stands for. 1 early on; large in mass levels, so the blob count stays bounded. */
    packet?: number;
  };
  goalEnergy: number;
  /** Enemies one water cell holds. A full cell is not entered: the stream queues and spills, it never compresses. */
  cellCapacity?: number;
}

/** A simulated blob: `size` enemies moving together. */
export interface Enemy {
  id: number;
  x: number;
  y: number;
  /** Position before the last step, for render interpolation. */
  px: number;
  py: number;
  /** Enemies in this blob. */
  size: number;
  /** Hit points left in the blob: size × hp per enemy, minus damage taken by the member being hit. */
  hp: number;
}

export interface Turret {
  cell: Point;
  cooldown: number;
}

/** A shot fired this tick, for the renderer only. */
export interface Shot {
  from: Point;
  to: Point;
}

export type Status = "running" | "won" | "lost";

export interface World {
  level: LevelDef;
  arsenal: Arsenal;
  packet: number;
  cellCapacity: number;
  /** Route cost to the goal per cell, including congestion. 0 at the goal. */
  field: Float64Array;
  /** Enemies per cell right now (sum of blob sizes). */
  density: Float64Array;
  /** Smoothed congestion per cell, 0 (free) to 1 (full). */
  congestion: Float32Array;
  rng: Rng;
  tick: number;
  status: Status;
  energy: number;
  /** Enemies not spawned yet. */
  toSpawn: number;
  spawnDebt: number;
  nextId: number;
  enemies: Enemy[];
  /** Enemies in the water (sum of blob sizes). */
  active: number;
  turrets: Turret[];
  shots: Shot[];
  killed: number;
  arrived: number;
  readonly perfect: boolean;
}

export function canPlace(level: LevelDef, capacity: number, placed: readonly Point[], p: Point): boolean {
  if (cellAt(level.map, p.x, p.y) !== LAND) return false;
  if (p.x < 0 || p.y < 0 || p.x >= level.map.width || p.y >= level.map.height) return false;
  if (placed.some((q) => q.x === p.x && q.y === p.y)) return false;
  return placed.length < capacity;
}

export function createWorld(level: LevelDef, arsenal: Arsenal, placements: readonly Point[], seed: number): World {
  const turrets: Turret[] = [];
  const placed: Point[] = [];
  for (const p of placements) {
    if (!canPlace(level, arsenal.capacity, placed, p)) throw new Error(`invalid placement ${p.x},${p.y}`);
    placed.push(p);
    turrets.push({ cell: { x: p.x, y: p.y }, cooldown: 0 });
  }
  return {
    level,
    arsenal,
    packet: Math.max(1, Math.floor(level.enemies.packet ?? 1)),
    cellCapacity: level.cellCapacity ?? 3,
    field: distanceField(level.map, level.map.goal),
    density: new Float64Array(level.map.cells.length),
    congestion: new Float32Array(level.map.cells.length),
    rng: createRng(seed),
    tick: 0,
    status: "running",
    energy: level.goalEnergy,
    toSpawn: level.enemies.count,
    spawnDebt: 0,
    nextId: 0,
    enemies: [],
    active: 0,
    turrets,
    shots: [],
    killed: 0,
    arrived: 0,
    get perfect() {
      return this.status === "won" && this.energy === this.level.goalEnergy;
    },
  };
}

/** Enemies not spawned yet plus the ones in the water. */
export function remaining(w: World): number {
  return w.toSpawn + w.active;
}

export function step(w: World): void {
  if (w.status !== "running") return;
  w.tick++;
  w.shots = [];
  spawn(w);
  if (w.tick % REROUTE_TICKS === 0) reroute(w);
  move(w);
  if (w.status !== "running") return;
  fire(w);
  if (w.toSpawn === 0 && w.active === 0) w.status = "won";
}

/** Steps until the run is decided. The cap only guards tests against a run that never ends. */
export function runToEnd(w: World, maxTicks = 30 * 60 * 30): void {
  while (w.status === "running" && w.tick < maxTicks) step(w);
}

function spawn(w: World) {
  const { spawn: at, width } = w.level.map;
  w.spawnDebt += w.level.enemies.perSecond * DT;
  while (w.toSpawn > 0 && w.spawnDebt >= Math.min(w.packet, w.toSpawn)) {
    const size = Math.min(w.packet, w.toSpawn);
    w.spawnDebt -= size;
    w.toSpawn -= size;
    const x = at.x + 0.5 + w.rng.range(-0.3, 0.3);
    const y = at.y + 0.5 + w.rng.range(-0.3, 0.3);
    w.enemies.push({ id: w.nextId++, x, y, px: x, py: y, size, hp: size * w.level.enemies.hp });
    w.active += size;
    w.density[at.y * width + at.x]! += size;
  }
}

function reroute(w: World) {
  const cost = new Float32Array(w.density.length);
  for (let i = 0; i < cost.length; i++) {
    // Load is relative to capacity, so the same rule holds for 3 enemies per cell and for 3,000.
    const load = w.density[i]! / w.cellCapacity;
    const crowd = Math.min(1, Math.max(0, (load - FREE_FLOW) / (1 - FREE_FLOW)));
    const c = w.congestion[i]! * (1 - CONGESTION_SMOOTHING) + crowd * CONGESTION_SMOOTHING;
    w.congestion[i] = c;
    cost[i] = 1 + CONGESTION_COST * c;
  }
  w.field = distanceField(w.level.map, w.level.map.goal, cost);
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function move(w: World) {
  const { map } = w.level;
  const stepLen = w.level.enemies.speed * DT;
  const survivors: Enemy[] = [];
  /** Room for `size` more; an empty cell always takes a blob, or an oversized blob could never move. */
  const fits = (i: number, size: number) => w.density[i] === 0 || w.density[i]! + size <= w.cellCapacity;
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    const ci = cy * map.width + cx;
    const here = w.field[ci]!;
    if (here === 0) {
      w.density[ci]! -= e.size;
      w.active -= e.size;
      w.arrived += e.size;
      w.energy -= e.size;
      if (w.energy <= 0) {
        w.energy = 0;
        w.status = "lost";
      }
      continue;
    }
    // Downhill neighbour with room; a full cell is skipped, so the stream spreads or queues.
    let best = here;
    let tx = -1;
    let ty = -1;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const ni = ny * map.width + nx;
      const d = w.field[ni]!;
      if (d < best && fits(ni, e.size)) {
        best = d;
        tx = nx;
        ty = ny;
      }
    }
    if (tx >= 0) {
      // Each blob aims at its own spot in the next cell, so a stream has width instead of a single file.
      const vx = tx + 0.5 + laneX(e.id) - e.x;
      const vy = ty + 0.5 + laneY(e.id) - e.y;
      const len = Math.hypot(vx, vy);
      const k = Math.min(1, stepLen / len);
      e.x += vx * k;
      e.y += vy * k;
      const ni = Math.floor(e.y) * map.width + Math.floor(e.x);
      if (ni !== ci && !fits(ni, e.size)) {
        // The step grazed a full cell on the way (diagonal or overshoot): stay put this tick.
        e.x = e.px;
        e.y = e.py;
      } else if (ni !== ci) {
        w.density[ci]! -= e.size;
        w.density[ni]! += e.size;
      }
    }
    survivors.push(e);
  }
  w.enemies = survivors;
}

/** A fixed offset within a cell per blob, from its id (deterministic, no rng draw). */
function laneX(id: number): number {
  return (((id * 0.618034) % 1) - 0.5) * 0.7;
}
function laneY(id: number): number {
  return (((id * 0.754878) % 1) - 0.5) * 0.7;
}

function fire(w: World) {
  const { range, damage, shotsPerSecond } = w.arsenal.turret;
  const hpEach = w.level.enemies.hp;
  for (const t of w.turrets) {
    t.cooldown -= DT;
    if (t.cooldown > 0) continue;
    const ox = t.cell.x + 0.5;
    const oy = t.cell.y + 0.5;
    let target: Enemy | undefined;
    let bestD = range * range;
    for (const e of w.enemies) {
      const d = (e.x - ox) ** 2 + (e.y - oy) ** 2;
      if (e.hp > 0 && d <= bestD) {
        bestD = d;
        target = e;
      }
    }
    if (!target) {
      t.cooldown = 0; // ready, but idle time does not bank shots
      continue;
    }
    t.cooldown += 1 / shotsPerSecond;
    target.hp = Math.max(0, target.hp - damage);
    // Members die as the pool drops below their share; a blob of 10 at 2 hp each loses one per 2 damage.
    const alive = Math.ceil(target.hp / hpEach - 1e-9);
    if (alive < target.size) {
      const dead = target.size - alive;
      target.size = alive;
      w.killed += dead;
      w.active -= dead;
      w.density[Math.floor(target.y) * w.level.map.width + Math.floor(target.x)]! -= dead;
    }
    w.shots.push({ from: { x: ox, y: oy }, to: { x: target.x, y: target.y } });
  }
  w.enemies = w.enemies.filter((e) => e.size > 0);
}
