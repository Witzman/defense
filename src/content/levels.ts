import { generateMap } from "../sim/map.ts";
import type { LevelDef } from "../sim/world.ts";

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
