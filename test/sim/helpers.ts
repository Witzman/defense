import type { GameMap, Point } from "../../src/sim/map.ts";
import { canPlace, createWorld, type Arsenal, type LevelDef, type World } from "../../src/sim/world.ts";

/**
 * The compact level shape the flow and rule tests are written in: one stream of green blobs (hp scales them)
 * and one cannon type that turns instantly.
 */
export interface TestLevel {
  map: GameMap;
  enemies: { count: number; perSecond: number; hp: number; speed: number; packet?: number };
  goalEnergy: number;
  cellCapacity?: number;
  turret: { range: number; damage: number; shotsPerSecond: number };
  capacity: number;
}

export function toLevel(l: TestLevel): LevelDef {
  return {
    map: l.map,
    enemies: { groups: [{ type: "green", count: l.enemies.count, perSecond: l.enemies.perSecond }], hpScale: l.enemies.hp, speed: l.enemies.speed, packet: l.enemies.packet },
    goalEnergy: l.goalEnergy,
    cellCapacity: l.cellCapacity,
  };
}

export function toArsenal(l: Pick<TestLevel, "turret" | "capacity">): Arsenal {
  return { turrets: { cannon: { capacity: l.capacity, stats: { ...l.turret, turnRate: 1e6 } } } };
}

export function world(l: TestLevel, placements: readonly Point[], seed: number): World {
  return createWorld(toLevel(l), toArsenal(l), placements.map((p) => ({ ...p, kind: "cannon" as const })), seed);
}

export function canPlaceCannon(l: TestLevel, placed: readonly Point[], p: Point): boolean {
  return canPlace(toLevel(l), toArsenal(l), placed.map((q) => ({ ...q, kind: "cannon" as const })), { ...p, kind: "cannon" });
}
