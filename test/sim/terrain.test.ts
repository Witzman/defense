import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { LAND, cellAt } from "../../src/sim/map.ts";
import { createWorld, SHORE_GAP, step } from "../../src/sim/world.ts";

// Owner report (#11): blobs crossed island corners. A blob stays in water, on every tick, in every level shape.
describe("enemies never walk on land", () => {
  it.each([0, 2, 5, 9, 14])("level %i: no blob is ever on a land cell", (i) => {
    const level = LEVELS[i]!();
    const w = createWorld({ ...level, goalEnergy: Number.MAX_SAFE_INTEGER }, { turrets: {} }, [], 1);
    let onLand = 0;
    for (let t = 0; t < 30 * 60 && w.status === "running"; t++) {
      step(w);
      for (const e of w.enemies) if (cellAt(level.map, Math.floor(e.x), Math.floor(e.y)) === LAND) onLand++;
    }
    expect(onLand).toBe(0);
  }, 60_000);

  // Drawn blobs have a radius of 0.3 cells and the shore reaches into the water cell; a blob keeps off the shore.
  it.each([2, 9])("level %i: a blob next to an island keeps off the drawn shore", (i) => {
    const level = LEVELS[i]!();
    const w = createWorld({ ...level, goalEnergy: Number.MAX_SAFE_INTEGER }, { turrets: {} }, [], 1);
    let close = 0;
    for (let t = 0; t < 30 * 60 && w.status === "running"; t++) {
      step(w);
      for (const e of w.enemies) {
        const cx = Math.floor(e.x), cy = Math.floor(e.y);
        const fx = e.x - cx, fy = e.y - cy;
        if (cellAt(level.map, cx - 1, cy) === LAND && fx < SHORE_GAP - 1e-9) close++;
        if (cellAt(level.map, cx + 1, cy) === LAND && fx > 1 - SHORE_GAP + 1e-9) close++;
        if (cellAt(level.map, cx, cy - 1) === LAND && fy < SHORE_GAP - 1e-9) close++;
        if (cellAt(level.map, cx, cy + 1) === LAND && fy > 1 - SHORE_GAP + 1e-9) close++;
      }
    }
    expect(close).toBe(0);
  }, 60_000);
});
