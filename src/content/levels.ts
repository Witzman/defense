import { generateMap, type GameMap, type Layout } from "../sim/map.ts";
import { BALANCE } from "./balance.ts";
import { createRng } from "../sim/rng.ts";
import type { EnemyGroup, LevelDef } from "../sim/world.ts";

/**
 * The campaign (#8): 25 levels from rules, each with a fixed seed, so a level is the same lake every time.
 * Numbers are tuned by the balancing simulation (G, #9); the shape of the curve is decided here:
 * - enemies from the owner's anchors (#22): 80, 200, ~3,500 in level 5, ~100,000 in level 10, then ×1.5 per level to
 *   ~44 million; one pace for all levels; 5 % of a level's enemies may reach the goals;
 * - one blob stands for a packet sized to keep a level at ≤ 3,000 blobs; a cell holds three packets;
 * - spawns 1 → 4, goals 1 → 3 (late), maps 40 → 184 cells wide, a labyrinth of channels with wider main arms.
 */
export const LEVEL_COUNT = 25;

const LAYOUTS: Layout[] = ["grid", "organic", "serpentine", "blocks"];

/** Order in which enemy types join the campaign, one per level. */
const TYPE_ORDER = ["green", "swarm", "armor", "ember", "shield", "rock"];

/** Owner's anchors for the mass (#22): level index → enemies. Between them the count grows geometrically. */
const MASS_ANCHORS: [number, number][] = [[0, 80], [1, 200], [4, 3_500], [9, 100_000]];
/** Growth per level after the last anchor: level 25 ends near 44 million. */
const MASS_GROWTH_LATE = 1.5;

export function enemyTotal(i: number): number {
  const last = MASS_ANCHORS[MASS_ANCHORS.length - 1]!;
  if (i >= last[0]) return Math.round(last[1] * MASS_GROWTH_LATE ** (i - last[0]));
  const k = MASS_ANCHORS.findIndex(([at]) => at > i);
  const [i0, n0] = MASS_ANCHORS[k - 1]!;
  const [i1, n1] = MASS_ANCHORS[k]!;
  return Math.round(n0 * (n1 / n0) ** ((i - i0) / (i1 - i0)));
}

/** Share of a level's enemies that may reach the goals before the run is lost (#22). */
export const GOAL_TOLERANCE = 0.05;
/** Cells per second for every level; only the enemy type changes it (#22: the mass scales, not the pace). */
export const ENEMY_SPEED = 2;

/** Seconds the taps run: 70 s in level 1, about 82 s in level 25. */
function spawnSeconds(i: number): number {
  return BALANCE.spawnSecondsBase + i * BALANCE.spawnSecondsPerLevel;
}

/** Generated maps, kept: a labyrinth may take a second to draw on a slow device, and nothing changes a map's cells. */
const maps = new Map<number, GameMap>();

export function campaignLevel(i: number): LevelDef {
  const rng = createRng(90_000 + i * 7919);
  const width = 40 + i * 6;
  const height = Math.round(width * 0.65);
  const spawns = i < 3 ? 1 : i < 9 ? 2 : i < 17 ? 3 : 4;
  const goals = i < 15 ? 1 : i < 21 ? 2 : 3;
  // Labyrinth (#17): one of four layouts per level, the networks combined with lakes on some; mixed by a fixed seed.
  const shape = createRng(5_000 + i * 7919);
  const layout = LAYOUTS[shape.int(LAYOUTS.length)]!;
  // Lakes would flood the small first maps: only from level 5 on.
  const lakes = shape.next() < 0.45 && i >= 4 ? shape.range(0.25, 0.6) : 0;
  const map = maps.get(i) ?? generateMap({
    width,
    height,
    seed: 1000 + i * 7919,
    spawns,
    goals,
    layout,
    lakes,
    // Wide corridors and land as islands in the stream (owner's reference, #17): channels take most of the spacing.
    spacing: 10 + i * 0.25,
    // The first levels are small and close: narrower channels, growing to full width by level 7.
    mainWidth: (10 + i * 0.25) * (0.5 + Math.min(i, 6) * 0.033),
    sideWidth: (10 + i * 0.25) * (0.32 + Math.min(i, 6) * 0.03),
    loops: 0.3,
    chokes: 0.35,
  });
  maps.set(i, map);

  const total = enemyTotal(i);
  const seconds = spawnSeconds(i);
  const available = TYPE_ORDER.slice(0, Math.min(TYPE_ORDER.length, i + 1));
  const kinds = i === 0 ? 1 : Math.min(available.length, 2 + Math.floor(i / 8));
  // While types are new, the newest always shows up; once all are known, the set type rotates (#22), so no type
  // turns up in every level. The rest are drawn from what the player has met.
  const types = [i < TYPE_ORDER.length ? available[available.length - 1]! : TYPE_ORDER[i % TYPE_ORDER.length]!];
  while (types.length < kinds) {
    const t = available[rng.int(available.length)]!;
    if (!types.includes(t)) types.push(t);
  }
  const groupCount = Math.max(types.length, spawns);
  const weights = Array.from({ length: groupCount }, () => 0.6 + rng.next());
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = total;
  const groups: EnemyGroup[] = weights.map((w, j) => {
    const count = j === groupCount - 1 ? left : Math.max(1, Math.round((total * w) / sum));
    left -= count;
    // Groups run in parallel (#22); a short head start keeps the colours apart as separate streams.
    const start = Math.round((seconds * 0.1 * j) / Math.max(1, groupCount - 1));
    return { type: types[j % types.length]!, count, perSecond: count / (seconds - start), start, spawn: j % spawns };
  });

  const packet = Math.max(1, Math.ceil(total / 3000));
  return {
    map,
    enemies: { groups, hpScale: BALANCE.hpBase * BALANCE.hpGrowth ** i, speed: ENEMY_SPEED, packet },
    goalEnergy: Math.max(1, Math.round((total * GOAL_TOLERANCE) / goals)),
    cellCapacity: 3 * packet,
  };
}

export const LEVELS: (() => LevelDef)[] = Array.from({ length: LEVEL_COUNT }, (_, i) => () => campaignLevel(i));

export const level1 = LEVELS[0]!;
export const level3 = LEVELS[2]!;

/** Total enemies in a level. */
export function enemyCount(l: LevelDef): number {
  return l.enemies.groups.reduce((n, g) => n + g.count, 0);
}
