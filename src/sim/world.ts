import { cellAt, LAND, type GameMap, type Point } from "./map.ts";
import { distanceField } from "./flow.ts";
import { createRng, type Rng } from "./rng.ts";
import { enemyType, SHIELD_BREAKER, vulnerability, type DamageType, type EnemyType } from "../content/enemies.ts";
import { turretType, type Pattern, type TurretKind, type TurretStats } from "../content/turrets.ts";

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
/** A turret fires once its aim is this close to the target (radians). */
const AIM_TOLERANCE = (5 * Math.PI) / 180;
/** Tracers drawn per turret and tick; the damage behind them may be millions of shots. */
const TRACERS = 3;

/** A coloured stream of one enemy type out of the spawn. */
export interface EnemyGroup {
  type: string;
  count: number;
  /** Enemies per second while the group flows. */
  perSecond: number;
  /** Seconds after the run starts that this group's tap opens. */
  start?: number;
  /** Index of the spawn it flows out of (default 0). */
  spawn?: number;
}

export interface LevelDef {
  map: GameMap;
  enemies: {
    groups: EnemyGroup[];
    /** Cells per second, times the type's own speed. */
    speed: number;
    /** Multiplier on every type's hit points and shield in this level. */
    hpScale?: number;
    /** Enemies one simulated blob stands for. 1 early on; large in mass levels, so the blob count stays bounded. */
    packet?: number;
  };
  /** Energy of each goal at the start. */
  goalEnergy: number;
  /** Enemies one water cell holds. A full cell is not entered: the stream queues and spills, it never compresses. */
  cellCapacity?: number;
}

/** What research gives the player for a run: per turret kind how many may stand and how strong each is. */
export interface Arsenal {
  /** Per kind: how many may stand, how strong each is, and the weapon pattern as research changed it. */
  turrets: Partial<Record<TurretKind, { capacity: number; stats: TurretStats; pattern?: Pattern }>>;
  ability?: Ability;
}

export interface Ability {
  damage: number;
  radius: number;
  /** Seconds between two uses. */
  cooldown: number;
}

/** A turret as the player placed it. Facing and arc in degrees; 0 is east, 90 south. */
export interface Placement extends Point {
  kind: TurretKind;
  facing?: number;
  arc?: number;
}

/** A simulated blob: `size` enemies of one type moving together. */
export interface Enemy {
  id: number;
  type: string;
  x: number;
  y: number;
  /** Position before the last step, for render interpolation. */
  px: number;
  py: number;
  size: number;
  /** Hit points left in the blob. Members die as it drops below their share. */
  hp: number;
  shield: number;
  hpEach: number;
  /** Cells per second now; baseSpeed while not slowed. */
  speed: number;
  baseSpeed: number;
  slowUntil: number;
  burnDps: number;
  burnUntil: number;
}

export interface Turret {
  placement: Placement;
  kind: TurretKind;
  stats: TurretStats;
  pattern: Pattern;
  damageType: DamageType;
  x: number;
  y: number;
  facing: number;
  arc: number;
  aim: number;
  /** Shots ready to fire (fractional). Capped while idle, so waiting never banks a volley. */
  ready: number;
}

/** What the renderer shows of this tick's fire. */
export type Shot =
  | { kind: "tracer"; from: Point; to: Point; turret: TurretKind }
  | { kind: "blast"; at: Point; radius: number; turret: TurretKind }
  | { kind: "cone"; from: Point; aim: number; angle: number; range: number };

export type Status = "running" | "won" | "lost";

interface GroupState {
  group: EnemyGroup;
  type: EnemyType;
  left: number;
  debt: number;
  startTick: number;
}

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
  groups: GroupState[];
  rng: Rng;
  tick: number;
  status: Status;
  /** Energy left per goal. */
  energies: number[];
  /** Sum over the goals. */
  readonly energy: number;
  /** Goal index per cell, -1 where there is none. */
  goalAt: Int16Array;
  /** Enemies not spawned yet. */
  toSpawn: number;
  nextId: number;
  enemies: Enemy[];
  /** Enemies in the water (sum of blob sizes). */
  active: number;
  turrets: Turret[];
  shots: Shot[];
  killed: number;
  arrived: number;
  abilityReadyTick: number;
  readonly perfect: boolean;
  /** Deals `amount` damage of a type to a blob: shield first, then hit points; returns the amount used. */
  hit(e: Enemy, amount: number, type: DamageType): number;
  /** Damage to every blob within `radius` of a point. */
  splash(x: number, y: number, radius: number, amount: number, type: DamageType): void;
  /** Adds a blob at a point (spawn, tests, abilities that summon). */
  spawnBlob(type: string, size: number, x: number, y: number): Enemy;
  /** Adds a turret mid-run (tests; the game places before the run). */
  place(p: Placement): void;
}

export function canPlace(level: LevelDef, arsenal: Arsenal, placed: readonly Placement[], p: Placement): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= level.map.width || p.y >= level.map.height) return false;
  if (cellAt(level.map, p.x, p.y) !== LAND) return false;
  if (placed.some((q) => q.x === p.x && q.y === p.y)) return false;
  const cap = arsenal.turrets[p.kind]?.capacity ?? 0;
  return placed.filter((q) => q.kind === p.kind).length < cap;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function createWorld(level: LevelDef, arsenal: Arsenal, placements: readonly Placement[], seed: number): World {
  const hpScale = level.enemies.hpScale ?? 1;
  const groups: GroupState[] = level.enemies.groups.map((g) => ({
    group: g,
    type: enemyType(g.type),
    left: g.count,
    debt: 0,
    startTick: Math.round((g.start ?? 0) / DT),
  }));
  const w: World = {
    level,
    arsenal,
    packet: Math.max(1, Math.floor(level.enemies.packet ?? 1)),
    cellCapacity: level.cellCapacity ?? 3,
    field: distanceField(level.map, level.map.goals),
    density: new Float64Array(level.map.cells.length),
    congestion: new Float32Array(level.map.cells.length),
    groups,
    rng: createRng(seed),
    tick: 0,
    status: "running",
    energies: level.map.goals.map(() => level.goalEnergy),
    get energy() {
      return this.energies.reduce((a, b) => a + b, 0);
    },
    goalAt: goalIndex(level.map),
    toSpawn: groups.reduce((n, g) => n + g.left, 0),
    nextId: 0,
    enemies: [],
    active: 0,
    turrets: [],
    shots: [],
    killed: 0,
    arrived: 0,
    abilityReadyTick: 0,
    get perfect() {
      return this.status === "won" && this.energies.every((e) => e === this.level.goalEnergy);
    },
    hit: (e, amount, type) => hit(w, e, amount, type),
    splash: (x, y, r, amount, type) => {
      for (const e of w.enemies) if (e.size > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) hit(w, e, amount, type);
    },
    spawnBlob: (type, size, x, y) => {
      const t = enemyType(type);
      const e: Enemy = {
        id: w.nextId++, type, x, y, px: x, py: y, size,
        hp: size * t.hp * hpScale, shield: size * t.shield * hpScale, hpEach: t.hp * hpScale,
        speed: level.enemies.speed * t.speed, baseSpeed: level.enemies.speed * t.speed, slowUntil: 0, burnDps: 0, burnUntil: 0,
      };
      w.enemies.push(e);
      w.active += size;
      w.density[Math.floor(y) * level.map.width + Math.floor(x)]! += size;
      return e;
    },
    place: (p) => {
      const kind = arsenal.turrets[p.kind];
      if (!kind) throw new Error(`no ${p.kind} in the arsenal`);
      const type = turretType(p.kind);
      const facing = rad(p.facing ?? 0);
      w.turrets.push({
        placement: p, kind: p.kind, stats: kind.stats, pattern: kind.pattern ?? type.pattern, damageType: type.damageType,
        x: p.x + 0.5, y: p.y + 0.5, facing, arc: rad(p.arc ?? 360), aim: facing,
        ready: Math.max(0, 1 - kind.stats.shotsPerSecond * DT),
      });
    },
  };
  const placed: Placement[] = [];
  for (const p of placements) {
    if (!canPlace(level, arsenal, placed, p)) throw new Error(`invalid placement ${p.kind} at ${p.x},${p.y}`);
    placed.push(p);
    w.place(p);
  }
  return w;
}

function goalIndex(map: GameMap): Int16Array {
  const at = new Int16Array(map.cells.length).fill(-1);
  map.goals.forEach((g, i) => (at[g.y * map.width + g.x] = i));
  return at;
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
  burn(w);
  fire(w);
  sweep(w);
  if (w.toSpawn === 0 && w.active === 0) w.status = "won";
}

/** Steps until the run is decided. The cap only guards tests against a run that never ends. */
export function runToEnd(w: World, maxTicks = 30 * 60 * 30): void {
  while (w.status === "running" && w.tick < maxTicks) step(w);
}

/** The player's click during a run. False while the ability cools down or is not researched. */
export function useAbility(w: World, x: number, y: number): boolean {
  const a = w.arsenal.ability;
  if (!a || w.status !== "running" || w.tick < w.abilityReadyTick) return false;
  w.abilityReadyTick = w.tick + Math.round(a.cooldown / DT);
  w.splash(x, y, a.radius, a.damage, "kinetic");
  w.shots.push({ kind: "blast", at: { x, y }, radius: a.radius, turret: "cannon" });
  sweep(w);
  return true;
}

// --- damage ---------------------------------------------------------------------------------------------

function hit(w: World, e: Enemy, amount: number, type: DamageType): number {
  if (e.size <= 0 || amount <= 0) return 0;
  const t = enemyType(e.type);
  const v = vulnerability(t, type);
  if (v === 0) return 0;
  let raw = amount;
  if (e.shield > 0) {
    const mult = type === "electric" ? SHIELD_BREAKER : 1;
    const onShield = raw * v * mult;
    if (onShield <= e.shield) {
      e.shield -= onShield;
      return amount;
    }
    raw -= e.shield / (v * mult);
    e.shield = 0;
  }
  e.hp = Math.max(0, e.hp - raw * v);
  // Members die as the pool drops below their share; a blob of 10 at 2 hp each loses one per 2 damage.
  killTo(w, e, Math.ceil(e.hp / e.hpEach - 1e-9));
  return amount;
}

/** Raw damage of a type it takes to finish this blob (Infinity if immune). */
function needed(e: Enemy, type: DamageType): number {
  const v = vulnerability(enemyType(e.type), type);
  if (v === 0) return Infinity;
  const mult = type === "electric" ? SHIELD_BREAKER : 1;
  return e.shield / (v * mult) + e.hp / v;
}

function killTo(w: World, e: Enemy, alive: number) {
  if (alive >= e.size) return;
  const dead = e.size - alive;
  e.size = alive;
  if (alive === 0) e.hp = 0;
  else e.hp = Math.min(e.hp, alive * e.hpEach);
  w.killed += dead;
  w.active -= dead;
  w.density[Math.floor(e.y) * w.level.map.width + Math.floor(e.x)]! -= dead;
}

function sweep(w: World) {
  if (w.enemies.some((e) => e.size <= 0)) w.enemies = w.enemies.filter((e) => e.size > 0);
}

function burn(w: World) {
  for (const e of w.enemies) {
    if (e.burnDps > 0 && w.tick <= e.burnUntil) hit(w, e, e.burnDps * DT, "fire");
    else e.burnDps = 0;
  }
}

// --- spawning and flow ----------------------------------------------------------------------------------

function spawn(w: World) {
  const { spawns } = w.level.map;
  for (const g of w.groups) {
    const at = spawns[g.group.spawn ?? 0] ?? spawns[0]!;
    if (g.left === 0 || w.tick < g.startTick) continue;
    g.debt += g.group.perSecond * DT;
    while (g.left > 0 && g.debt >= Math.min(w.packet, g.left)) {
      const size = Math.min(w.packet, g.left);
      g.debt -= size;
      g.left -= size;
      w.toSpawn -= size;
      const pos = { x: at.x + 0.5 + w.rng.range(-0.3, 0.3), y: at.y + 0.5 + w.rng.range(-0.3, 0.3) };
      offShore(w.level.map, pos);
      w.spawnBlob(g.group.type, size, pos.x, pos.y);
    }
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
  w.field = distanceField(w.level.map, w.level.map.goals, cost);
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function move(w: World) {
  const { map } = w.level;
  const survivors: Enemy[] = [];
  /** Room for `size` more; an empty cell always takes a blob, or an oversized blob could never move. */
  const fits = (i: number, size: number) => w.density[i] === 0 || w.density[i]! + size <= w.cellCapacity;
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (e.slowUntil < w.tick) e.speed = e.baseSpeed;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    const ci = cy * map.width + cx;
    const here = w.field[ci]!;
    if (here === 0) {
      const goal = Math.max(0, w.goalAt[ci]!);
      w.density[ci]! -= e.size;
      w.active -= e.size;
      w.arrived += e.size;
      w.energies[goal]! -= e.size;
      if (w.energies[goal]! <= 0) {
        w.energies[goal] = 0;
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
      // A diagonal step needs water on both sides, or the blob cuts across an island corner (#11).
      if (dx !== 0 && dy !== 0 && (map.cells[cy * map.width + nx] === LAND || map.cells[ny * map.width + cx] === LAND)) continue;
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
      const k = Math.min(1, (e.speed * DT) / len);
      e.x += vx * k;
      e.y += vy * k;
      offShore(map, e);
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

/**
 * How close a blob may come to a cell edge that borders land (#11): a drawn blob has a radius of 0.3 cells and the
 * drawn shore reaches 0.12 cells into the water cell (render/canvas.ts), so the two only touch.
 */
export const SHORE_GAP = 0.42;

/** Pushes a blob off the shore of its cell, so it never overlaps an island on screen. Stays in its cell. */
function offShore(map: GameMap, e: { x: number; y: number }) {
  const cx = Math.floor(e.x);
  const cy = Math.floor(e.y);
  if (cellAt(map, cx - 1, cy) === LAND) e.x = Math.max(e.x, cx + SHORE_GAP);
  if (cellAt(map, cx + 1, cy) === LAND) e.x = Math.min(e.x, cx + 1 - SHORE_GAP);
  if (cellAt(map, cx, cy - 1) === LAND) e.y = Math.max(e.y, cy + SHORE_GAP);
  if (cellAt(map, cx, cy + 1) === LAND) e.y = Math.min(e.y, cy + 1 - SHORE_GAP);
}

/** A fixed offset within a cell per blob, from its id (deterministic, no rng draw). */
function laneX(id: number): number {
  return (((id * 0.618034) % 1) - 0.5) * 0.7;
}
function laneY(id: number): number {
  return (((id * 0.754878) % 1) - 0.5) * 0.7;
}

// --- turrets --------------------------------------------------------------------------------------------

function canTarget(t: Turret, e: Enemy): boolean {
  if (e.size <= 0) return false;
  const dx = e.x - t.x;
  const dy = e.y - t.y;
  if (dx * dx + dy * dy > t.stats.range * t.stats.range) return false;
  if (t.arc < 2 * Math.PI - 1e-6 && Math.abs(angleDiff(Math.atan2(dy, dx), t.facing)) > t.arc / 2) return false;
  const type = enemyType(e.type);
  if (vulnerability(type, t.damageType) === 0) return false;
  if (t.pattern.kind === "beam" && type.instantKillImmune) return false;
  return true;
}

function nearest(w: World, t: Turret): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const e of w.enemies) {
    if (!canTarget(t, e)) continue;
    const d = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function fire(w: World) {
  for (const t of w.turrets) {
    const reload = t.stats.shotsPerSecond * DT;
    const target = nearest(w, t);
    // Swivel toward the target at the turret's rate; fire only once on target.
    let onTarget = false;
    if (target) {
      const want = Math.atan2(target.y - t.y, target.x - t.x);
      const turn = rad(t.stats.turnRate) * DT;
      t.aim += Math.max(-turn, Math.min(turn, angleDiff(want, t.aim)));
      onTarget = Math.abs(angleDiff(want, t.aim)) <= AIM_TOLERANCE;
    }
    if (!target || !onTarget) {
      // Waiting banks at most the one shot that fires on the first tick on target, never a volley.
      t.ready = Math.min(Math.max(0, 1 - reload), t.ready + reload);
      continue;
    }
    if (t.pattern.kind === "cone") {
      fireCone(w, t, t.pattern);
      continue;
    }
    t.ready += reload;
    const shots = Math.floor(t.ready);
    t.ready -= shots;
    if (shots < 1) continue;
    switch (t.pattern.kind) {
      case "single":
        fireSingle(w, t, target, shots);
        break;
      case "splash":
        fireSplash(w, t, target, shots, t.pattern.radius, t.pattern.burnSeconds);
        break;
      case "pierce":
        firePierce(w, t, target, shots, t.pattern.width);
        break;
      case "slow":
        fireSlow(w, t, target, shots, t.pattern);
        break;
      case "beam":
        fireBeam(w, t, target, shots);
        break;
      case "chain":
        fireChain(w, t, target, shots, t.pattern);
        break;
    }
  }
}

/** All shots of the tick as one damage budget: the nearest target takes what kills it, the rest spills on. */
function fireSingle(w: World, t: Turret, first: Enemy, shots: number) {
  let budget = shots * t.stats.damage;
  let target: Enemy | undefined = first;
  let tracers = 0;
  while (target && budget > 1e-9) {
    const use = Math.min(budget, needed(target, t.damageType));
    hit(w, target, use, t.damageType);
    budget -= use;
    if (tracers++ < TRACERS) w.shots.push({ kind: "tracer", from: { x: t.x, y: t.y }, to: { x: target.x, y: target.y }, turret: t.kind });
    if (target.size > 0) break;
    target = nearest(w, t);
  }
}

function fireSplash(w: World, t: Turret, first: Enemy, shots: number, radius: number, burnSeconds?: number) {
  // Many shells per tick become a few impacts carrying their share of the damage.
  const impacts = Math.min(shots, 32);
  const each = (shots * t.stats.damage) / impacts;
  let target: Enemy | undefined = first;
  for (let i = 0; i < impacts && target; i++) {
    const { x, y } = target;
    w.splash(x, y, radius, each, t.damageType);
    if (burnSeconds) ignite(w, x, y, radius, t.stats.damage * t.stats.shotsPerSecond, burnSeconds);
    if (i < TRACERS) w.shots.push({ kind: "blast", at: { x, y }, radius, turret: t.kind });
    if (target.size <= 0) target = nearest(w, t);
  }
}

/** Sets everything around a point burning (fire bombs). */
function ignite(w: World, x: number, y: number, radius: number, dps: number, seconds: number) {
  for (const e of w.enemies) {
    if (e.size <= 0 || (e.x - x) ** 2 + (e.y - y) ** 2 > radius * radius) continue;
    if (vulnerability(enemyType(e.type), "fire") === 0) continue;
    e.burnDps = Math.max(e.burnDps, dps);
    e.burnUntil = Math.max(e.burnUntil, w.tick + Math.round(seconds / DT));
  }
}

/** One slug through everything on the line from the turret past the target, out to full range. */
function firePierce(w: World, t: Turret, first: Enemy, shots: number, width: number) {
  const dx = first.x - t.x;
  const dy = first.y - t.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const damage = shots * t.stats.damage;
  for (const e of w.enemies) {
    if (e.size <= 0) continue;
    const along = (e.x - t.x) * ux + (e.y - t.y) * uy;
    if (along < 0 || along > t.stats.range) continue;
    const across = Math.abs((e.x - t.x) * uy - (e.y - t.y) * ux);
    if (across <= width) hit(w, e, damage, t.damageType);
  }
  w.shots.push({ kind: "tracer", from: { x: t.x, y: t.y }, to: { x: t.x + ux * t.stats.range, y: t.y + uy * t.stats.range }, turret: t.kind });
}

/** A cold burst: a little damage and everything around the target slowed for a while. */
function fireSlow(w: World, t: Turret, first: Enemy, shots: number, p: { radius: number; factor: number; seconds: number }) {
  const { x, y } = first;
  w.splash(x, y, p.radius, shots * t.stats.damage, t.damageType);
  for (const e of w.enemies) {
    if (e.size <= 0 || (e.x - x) ** 2 + (e.y - y) ** 2 > p.radius * p.radius) continue;
    e.speed = Math.min(e.speed, e.baseSpeed * (1 - p.factor));
    e.slowUntil = w.tick + Math.round(p.seconds / DT);
  }
  w.shots.push({ kind: "blast", at: { x, y }, radius: p.radius, turret: t.kind });
}

/**
 * Contact kill: a shot kills one member outright if a member has no more hit points than the beam's damage;
 * against tougher enemies it is plain damage. So the laser executes weak masses and has to grow with them.
 */
function fireBeam(w: World, t: Turret, first: Enemy, shots: number) {
  let left = shots;
  let target: Enemy | undefined = first;
  let tracers = 0;
  while (target && left > 0) {
    if (target.hpEach <= t.stats.damage && target.shield <= 0) {
      const k = Math.min(left, target.size);
      killTo(w, target, target.size - k);
      left -= k;
    } else {
      const budget = left * t.stats.damage;
      const use = Math.min(budget, needed(target, t.damageType));
      hit(w, target, use, t.damageType);
      left -= Math.ceil(use / t.stats.damage);
    }
    if (tracers++ < TRACERS) w.shots.push({ kind: "tracer", from: { x: t.x, y: t.y }, to: { x: target.x, y: target.y }, turret: t.kind });
    target = target.size > 0 ? undefined : nearest(w, t);
  }
}

function fireChain(w: World, t: Turret, first: Enemy, shots: number, p: { jumps: number; reach: number; falloff: number }) {
  let damage = shots * t.stats.damage;
  const struck = new Set<Enemy>();
  let target: Enemy | undefined = first;
  let from: Point = { x: t.x, y: t.y };
  for (let j = 0; j <= p.jumps && target; j++) {
    hit(w, target, damage, t.damageType);
    struck.add(target);
    w.shots.push({ kind: "tracer", from, to: { x: target.x, y: target.y }, turret: t.kind });
    from = { x: target.x, y: target.y };
    damage *= p.falloff;
    let next: Enemy | undefined;
    let bestD = p.reach * p.reach;
    for (const e of w.enemies) {
      if (struck.has(e) || e.size <= 0 || vulnerability(enemyType(e.type), t.damageType) === 0) continue;
      const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
      if (d <= bestD) {
        bestD = d;
        next = e;
      }
    }
    target = next;
  }
}

function fireCone(w: World, t: Turret, p: { angle: number; burnSeconds: number }) {
  t.ready = Math.min(t.ready, 1);
  const dps = t.stats.damage * t.stats.shotsPerSecond;
  const half = rad(p.angle) / 2;
  for (const e of w.enemies) {
    if (!canTarget(t, e)) continue;
    if (Math.abs(angleDiff(Math.atan2(e.y - t.y, e.x - t.x), t.aim)) > half) continue;
    hit(w, e, dps * DT, t.damageType);
    // Burning continues after the flame: half the flame's damage per second, for burnSeconds.
    e.burnDps = Math.max(e.burnDps, dps / 2);
    e.burnUntil = w.tick + Math.round(p.burnSeconds / DT);
  }
  w.shots.push({ kind: "cone", from: { x: t.x, y: t.y }, aim: t.aim, angle: rad(p.angle), range: t.stats.range });
}
