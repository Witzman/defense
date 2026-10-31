import { generateMap } from "../sim/map.ts";
import type { LevelDef } from "../sim/world.ts";

// Numbers are first guesses until balancing (G, #9).

/** Level 1: a small, close lake and one green stream. */
export function level1(): LevelDef {
  return {
    map: generateMap({ width: 40, height: 26, seed: 1001 }),
    enemies: { groups: [{ type: "green", count: 70, perSecond: 1.5 }], hpScale: 3, speed: 2 },
    goalEnergy: 10,
  };
}

/** Level 2: the first jump in scale, and armour behind the green stream — kinetic damage alone stalls. */
export function level2(): LevelDef {
  return {
    map: generateMap({ width: 90, height: 58, seed: 2002 }),
    enemies: {
      groups: [
        { type: "green", count: 600, perSecond: 12 },
        { type: "armor", count: 300, perSecond: 8, start: 25 },
      ],
      hpScale: 3,
      speed: 2.5,
    },
    goalEnergy: 40,
    cellCapacity: 4,
  };
}

/** Level 3: mass. Blobs are packets of 10; the far view shows a fluid, zooming in shows blobs. */
export function level3(): LevelDef {
  return {
    map: generateMap({ width: 150, height: 96, seed: 3003 }),
    enemies: {
      groups: [
        { type: "green", count: 15000, perSecond: 250 },
        { type: "shield", count: 8000, perSecond: 200, start: 30 },
        { type: "swarm", count: 7000, perSecond: 300, start: 60 },
      ],
      hpScale: 3,
      speed: 3,
      packet: 10,
    },
    goalEnergy: 3000,
    cellCapacity: 40,
  };
}

export const LEVELS = [level1, level2, level3];

/** Total enemies in a level. */
export function enemyCount(l: LevelDef): number {
  return l.enemies.groups.reduce((n, g) => n + g.count, 0);
}
