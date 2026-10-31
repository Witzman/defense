import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { runToEnd, step} from "../../src/sim/world.ts";
import { world, type TestLevel } from "./helpers.ts";

/**
 * Two routes from spawn (left) to goal (right):
 *   row 1: short, one cell wide
 *   row 7: long detour, one cell wide (down column 1, along row 7, up column 28)
 */
function twoRoutes(): GameMap {
  const width = 30;
  const height = 9;
  const cells = new Uint8Array(width * height).fill(LAND);
  const water = (x: number, y: number) => (cells[y * width + x] = WATER);
  for (let x = 0; x < width; x++) water(x, 1);
  for (let y = 1; y <= 7; y++) {
    water(1, y);
    water(28, y);
  }
  for (let x = 1; x <= 28; x++) water(x, 7);
  return { width, height, cells, spawn: { x: 0, y: 1 }, goal: { x: width - 1, y: 1 } };
}

function level(perSecond: number): TestLevel {
  return {
    map: twoRoutes(),
    enemies: { count: 120, perSecond, hp: 1, speed: 3 },
    goalEnergy: 1000,
    turret: { range: 1, damage: 0, shotsPerSecond: 1 },
    capacity: 0,
  };
}

/** Share of enemies that ever touched the detour row. */
function detourShare(perSecond: number): number {
  const w = world(level(perSecond), [], 1);
  const detoured = new Set<number>();
  while (w.status === "running") {
    step(w);
    for (const e of w.enemies) if (Math.floor(e.y) === 7) detoured.add(e.id);
  }
  return detoured.size / 120;
}

describe("overflow", () => {
  it("a thin stream takes the short route only", () => {
    expect(detourShare(1)).toBe(0);
  });

  it("a stream the short route cannot carry spills over to the detour", () => {
    expect(detourShare(40)).toBeGreaterThan(0.15);
  });

  it("never packs more enemies into a cell than it holds", () => {
    const w = world(level(40), [], 1);
    while (w.status === "running") {
      step(w);
      const count = new Map<number, number>();
      for (const e of w.enemies) {
        const c = Math.floor(e.y) * 30 + Math.floor(e.x);
        count.set(c, (count.get(c) ?? 0) + 1);
      }
      // The spawn cell is where the tap opens; it may hold the queue that waits to enter.
      count.delete(1 * 30 + 0);
      for (const n of count.values()) expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("still delivers every enemy", () => {
    const w = world(level(40), [], 1);
    runToEnd(w);
    expect(w.status).toBe("won");
    expect(w.arrived).toBe(120);
  });
});
