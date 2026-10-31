import { generateMap } from "../sim/map.ts";
import type { LevelDef } from "../sim/world.ts";

/** Level 2: the first jump in scale — a bigger lake and a stream the eye no longer counts. */
export function level2(): LevelDef {
  return {
    map: generateMap({ width: 90, height: 58, seed: 2002 }),
    enemies: { count: 900, perSecond: 12, hp: 3, speed: 2.5 },
    goalEnergy: 40,
    turret: { range: 5, damage: 1, shotsPerSecond: 6 },
    capacity: 6,
    cellCapacity: 4,
  };
}

/** Level 3: mass. Each blob is a packet of 10; the far view shows a fluid, zooming in shows blobs. */
export function level3(): LevelDef {
  return {
    map: generateMap({ width: 150, height: 96, seed: 3003 }),
    enemies: { count: 30000, perSecond: 250, hp: 3, speed: 3, packet: 10 },
    goalEnergy: 3000,
    turret: { range: 7, damage: 10, shotsPerSecond: 20 },
    capacity: 12,
    cellCapacity: 40,
  };
}

export const LEVELS = [level1, level2, level3];

/** Level 1 of milestone A: a small, close map with a single stream. Numbers are a first guess until balancing (G). */
export function level1(): LevelDef {
  return {
    map: generateMap({ width: 40, height: 26, seed: 1001 }),
    enemies: { count: 70, perSecond: 1.5, hp: 3, speed: 2 },
    goalEnergy: 10,
    turret: { range: 4, damage: 1, shotsPerSecond: 3 },
    capacity: 3,
  };
}
