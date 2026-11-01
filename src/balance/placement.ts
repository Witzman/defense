import { BALANCE } from "../content/balance.ts";
import type { Point } from "../sim/map.ts";
import { cellAt, LAND, WATER } from "../sim/map.ts";
import { canPlace, createWorld, step, type Arsenal, type LevelDef, type Placement } from "../sim/world.ts";
import type { TurretKind } from "../content/turrets.ts";

/**
 * Where the stream goes: one run without turrets, adding up enemies per cell and tick. A real player learns
 * the same by watching a run or two.
 */
export function sampleFlow(level: LevelDef, seed = 1, maxTicks = 30 * 240): Float64Array {
  // The probe has no turrets and a fixed run seed, so it is the same on every try of a level (#28) and does not
  // depend on hit points: once per level and process is enough (it is the costliest part of a try on big maps).
  const key = `${level.runSeed}:${seed}:${maxTicks}:${JSON.stringify(level.enemies.groups)}:${BALANCE.dangerCost}`;
  const perMap = flows.get(level.map) ?? new Map<string, Float64Array>();
  flows.set(level.map, perMap);
  const hit = perMap.get(key);
  if (hit) return hit;
  const flow = probeFlow(level, seed, maxTicks);
  perMap.set(key, flow);
  return flow;
}

const flows = new WeakMap<object, Map<string, Float64Array>>();

function probeFlow(level: LevelDef, seed: number, maxTicks: number): Float64Array {
  // Goals that never fall: the whole level flows, groups that start late included.
  const w = createWorld({ ...level, goalEnergy: Number.MAX_SAFE_INTEGER }, { turrets: {} }, [], seed);
  const flow = new Float64Array(level.map.cells.length);
  while (w.status === "running" && w.tick < maxTicks) {
    step(w);
    // Every third tick is plenty and keeps big levels fast.
    if (w.tick % 3 === 0) for (let i = 0; i < flow.length; i++) flow[i]! += w.density[i]!;
  }
  return flow;
}

/** Land cells next to water: the only sensible building spots. */
function shoreCells(level: LevelDef): Point[] {
  const { map } = level;
  const out: Point[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (cellAt(map, x, y) !== LAND) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) if (cellAt(map, x + dx, y + dy) === WATER) near = true;
      if (near) out.push({ x, y });
    }
  return out;
}

/**
 * Greedy cover: each turret goes where it reaches the most flow that other turrets do not cover yet
 * (a covered cell counts half again for each turret already on it). Kinds in the given order.
 */
export function placeGreedy(level: LevelDef, arsenal: Arsenal, flow: Float64Array, order: TurretKind[]): Placement[] {
  const { map } = level;
  const shore = shoreCells(level);
  const cover = new Float64Array(flow.length);
  const placed: Placement[] = [];
  // The busiest cells only: on big lakes the long tail adds time, not decisions.
  const hot: number[] = [];
  for (let i = 0; i < flow.length; i++) if (flow[i]! > 0) hot.push(i);
  hot.sort((a, b) => flow[b]! - flow[a]!);
  hot.length = Math.min(hot.length, 1500);
  for (const kind of order) {
    const a = arsenal.turrets[kind];
    if (!a) continue;
    const r = a.stats.range;
    for (let n = 0; n < a.capacity; n++) {
      let best: Placement | undefined;
      let bestScore = 0;
      for (const p of shore) {
        const cand = { ...p, kind };
        if (!canPlace(level, arsenal, placed, cand)) continue;
        let score = 0;
        for (const i of hot) {
          const x = i % map.width;
          const y = (i - x) / map.width;
          if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) score += flow[i]! / 2 ** cover[i]!;
        }
        if (score > bestScore) [best, bestScore] = [cand, score];
      }
      if (!best) break;
      placed.push(best);
      for (const i of hot) {
        const x = i % map.width;
        const y = (i - x) / map.width;
        if ((x - best.x) ** 2 + (y - best.y) ** 2 <= r * r) cover[i]!++;
      }
    }
  }
  return placed;
}
