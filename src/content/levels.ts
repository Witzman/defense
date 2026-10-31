import { generateMap } from "../sim/map.ts";
import { createRng } from "../sim/rng.ts";
import type { EnemyGroup, LevelDef } from "../sim/world.ts";

/**
 * The campaign (#8): 25 levels from rules, each with a fixed seed, so a level is the same lake every time.
 * Numbers are tuned by the balancing simulation (G, #9); the shape of the curve is decided here:
 * - enemies ×1.6 per level for levels 1–4 (single blobs, the eye still counts), then ×1.475 up to ~1,000,000;
 * - one blob stands for a packet sized to keep a level at ≤ 3,000 blobs; a cell holds three packets;
 * - spawns 1 → 4, goals 1 → 3 (late), maps 40 → 184 cells wide, rivers wider and lakes more open.
 */
export const LEVEL_COUNT = 25;

/** Order in which enemy types join the campaign, one per level. */
const TYPE_ORDER = ["green", "swarm", "armor", "ember", "shield", "rock"];

export function enemyTotal(i: number): number {
  return i < 4 ? Math.round(70 * 1.6 ** i) : Math.round(287 * 1.475 ** (i - 3));
}

/** Seconds the taps run: about a minute early, two and a half minutes at the end. */
function spawnSeconds(i: number): number {
  return 50 + i * 4;
}

export function campaignLevel(i: number): LevelDef {
  const rng = createRng(90_000 + i * 7919);
  const width = 40 + i * 6;
  const height = Math.round(width * 0.65);
  const spawns = i < 3 ? 1 : i < 9 ? 2 : i < 17 ? 3 : 4;
  const goals = i < 15 ? 1 : i < 21 ? 2 : 3;
  const map = generateMap({
    width,
    height,
    seed: 1000 + i * 7919,
    spawns,
    goals,
    paths: i < 9 ? 3 : 2,
    riverWidth: 3 + Math.floor(i / 6),
    openness: 0.05 + i * 0.012,
    chokes: Math.max(0.05, 0.5 - i * 0.019),
  });

  const total = enemyTotal(i);
  const seconds = spawnSeconds(i);
  const available = TYPE_ORDER.slice(0, Math.min(TYPE_ORDER.length, i + 1));
  const kinds = i === 0 ? 1 : Math.min(available.length, 2 + Math.floor(i / 8));
  // The newest type always shows up; the rest are drawn from what the player has met.
  const types = [available[available.length - 1]!];
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
    // Groups open one after another so the colours arrive as separate streams.
    const start = Math.round((seconds * 0.3 * j) / Math.max(1, groupCount - 1));
    return { type: types[j % types.length]!, count, perSecond: count / (seconds - start), start, spawn: j % spawns };
  });

  const packet = Math.max(1, Math.ceil(total / 3000));
  return {
    map,
    enemies: { groups, hpScale: 3 * 1.08 ** i, speed: 2 + i * 0.06, packet },
    goalEnergy: Math.max(10, Math.round((total * 0.12) / goals)),
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
