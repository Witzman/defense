import { describe, expect, it } from "vitest";
import { level1 } from "../../src/content/levels.ts";
import { canPlace, createWorld, DT, runToEnd, type Arsenal } from "../../src/sim/world.ts";

/** Three turrets at base strength: what early research gives. */
const ARSENAL: Arsenal = { capacity: 3, turret: { range: 4, damage: 1, shotsPerSecond: 3 } };
import type { Point } from "../../src/sim/map.ts";

/** Greedy placement: each turret on the land cell that covers the most water on the enemy path. */
function goodPlacement(): Point[] {
  const level = level1();
  const { map } = level;
  const w = createWorld(level, ARSENAL, [], 1);
  const path = new Set<number>();
  while (w.status === "running") {
    runToEnd(w, w.tick + 1);
    for (const e of w.enemies) path.add(Math.floor(e.y) * map.width + Math.floor(e.x));
  }
  const placed: Point[] = [];
  const covered = new Set<number>();
  for (let n = 0; n < ARSENAL.capacity; n++) {
    let best: Point | undefined;
    let bestScore = -1;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!canPlace(level, ARSENAL.capacity, placed, { x, y })) continue;
        let score = 0;
        for (const i of path) {
          if (covered.has(i)) continue;
          const px = i % map.width;
          const py = (i - px) / map.width;
          if ((px - x) ** 2 + (py - y) ** 2 <= ARSENAL.turret.range ** 2) score++;
        }
        if (score > bestScore) [best, bestScore] = [{ x, y }, score];
      }
    placed.push(best!);
    for (const i of path) {
      const px = i % map.width;
      const py = (i - px) / map.width;
      if ((px - best!.x) ** 2 + (py - best!.y) ** 2 <= ARSENAL.turret.range ** 2) covered.add(i);
    }
  }
  return placed;
}

describe("level 1", () => {
  it("is lost without turrets", () => {
    const w = createWorld(level1(), ARSENAL, [], 1);
    runToEnd(w);
    expect(w.status).toBe("lost");
  });

  it("can be won with a sensible placement", () => {
    const w = createWorld(level1(), ARSENAL, goodPlacement(), 1);
    runToEnd(w);
    expect(w.status).toBe("won");
  });

  it("takes between 30 seconds and 2 minutes when won", () => {
    const w = createWorld(level1(), ARSENAL, goodPlacement(), 1);
    runToEnd(w);
    const seconds = w.tick * DT;
    expect(seconds).toBeGreaterThan(30);
    expect(seconds).toBeLessThan(120);
  });
});
