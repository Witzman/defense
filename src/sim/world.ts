import { cellAt, LAND, type GameMap, type Point } from "./map.ts";
import { distanceField } from "./flow.ts";
import { createRng, type Rng } from "./rng.ts";

/** Simulation step in seconds. Fixed, so a run with the same seed replays exactly. */
export const DT = 1 / 30;

export interface LevelDef {
  map: GameMap;
  enemies: { count: number; perSecond: number; hp: number; speed: number };
  goalEnergy: number;
  turret: { range: number; damage: number; shotsPerSecond: number };
  capacity: number;
}

export interface Enemy {
  id: number;
  x: number;
  y: number;
  /** Position before the last step, for render interpolation. */
  px: number;
  py: number;
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
  field: Float64Array;
  rng: Rng;
  tick: number;
  status: Status;
  energy: number;
  toSpawn: number;
  spawnDebt: number;
  enemies: Enemy[];
  turrets: Turret[];
  shots: Shot[];
  killed: number;
  arrived: number;
  readonly perfect: boolean;
}

export function canPlace(level: LevelDef, placed: readonly Point[], p: Point): boolean {
  if (cellAt(level.map, p.x, p.y) !== LAND) return false;
  if (p.x < 0 || p.y < 0 || p.x >= level.map.width || p.y >= level.map.height) return false;
  if (placed.some((q) => q.x === p.x && q.y === p.y)) return false;
  return placed.length < level.capacity;
}

export function createWorld(level: LevelDef, placements: readonly Point[], seed: number): World {
  const turrets: Turret[] = [];
  const placed: Point[] = [];
  for (const p of placements) {
    if (!canPlace(level, placed, p)) throw new Error(`invalid placement ${p.x},${p.y}`);
    placed.push(p);
    turrets.push({ cell: { x: p.x, y: p.y }, cooldown: 0 });
  }
  return {
    level,
    field: distanceField(level.map, level.map.goal),
    rng: createRng(seed),
    tick: 0,
    status: "running",
    energy: level.goalEnergy,
    toSpawn: level.enemies.count,
    spawnDebt: 0,
    enemies: [],
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
  return w.toSpawn + w.enemies.length;
}

export function step(w: World): void {
  if (w.status !== "running") return;
  w.tick++;
  w.shots = [];
  spawn(w);
  move(w);
  if (w.status !== "running") return;
  fire(w);
  if (w.toSpawn === 0 && w.enemies.length === 0) w.status = "won";
}

/** Steps until the run is decided. The cap only guards tests against a run that never ends. */
export function runToEnd(w: World, maxTicks = 30 * 60 * 30): void {
  while (w.status === "running" && w.tick < maxTicks) step(w);
}

function spawn(w: World) {
  const { spawn: at } = w.level.map;
  w.spawnDebt += w.level.enemies.perSecond * DT;
  while (w.spawnDebt >= 1 && w.toSpawn > 0) {
    w.spawnDebt -= 1;
    w.toSpawn--;
    const x = at.x + 0.5 + w.rng.range(-0.3, 0.3);
    const y = at.y + 0.5 + w.rng.range(-0.3, 0.3);
    w.enemies.push({ id: w.level.enemies.count - w.toSpawn, x, y, px: x, py: y, hp: w.level.enemies.hp });
  }
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function move(w: World) {
  const { map } = w.level;
  const stepLen = w.level.enemies.speed * DT;
  const survivors: Enemy[] = [];
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    const here = w.field[cy * map.width + cx]!;
    if (here === 0) {
      w.arrived++;
      w.energy--;
      if (w.energy <= 0) {
        w.energy = 0;
        w.status = "lost";
      }
      continue;
    }
    let best = here;
    let tx = cx;
    let ty = cy;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const d = w.field[ny * map.width + nx]!;
      if (d < best) {
        best = d;
        tx = nx;
        ty = ny;
      }
    }
    const vx = tx + 0.5 - e.x;
    const vy = ty + 0.5 - e.y;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      const k = Math.min(1, stepLen / len);
      e.x += vx * k;
      e.y += vy * k;
    }
    survivors.push(e);
  }
  w.enemies = survivors;
}

function fire(w: World) {
  const { range, damage, shotsPerSecond } = w.level.turret;
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
    target.hp -= damage;
    w.shots.push({ from: { x: ox, y: oy }, to: { x: target.x, y: target.y } });
  }
  const before = w.enemies.length;
  w.enemies = w.enemies.filter((e) => e.hp > 0);
  w.killed += before - w.enemies.length;
}
