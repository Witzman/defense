import type { Point } from "../../src/sim/map.ts";
import { createWorld, type Arsenal, type LevelDef, type World } from "../../src/sim/world.ts";

/** A level plus the arsenal a test runs it with, in one object. */
export type TestLevel = LevelDef & Arsenal;

export function world(l: TestLevel, placements: readonly Point[], seed: number): World {
  return createWorld(l, { capacity: l.capacity, turret: l.turret }, placements, seed);
}
