import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { descend, detourBlock, LAND } from "../../src/sim/map.ts";
import { distanceField } from "../../src/sim/flow.ts";
import { createWorld, step } from "../../src/sim/world.ts";

// #17: when the main arm clogs, the mass takes the other ways. Run a level without turrets and watch where it flows.
describe("a clogged main arm spills into the detour", () => {
  it.each([5, 9])("level %i: blobs use the detour, far from the main route", (i) => {
    const level = LEVELS[i]!();
    const { map } = level;
    const field = distanceField(map, map.goals);
    const s = map.spawns[0]!;
    const main = descend(map, field, s);
    // The detour: the cheapest way once the main route is blocked, as the generator checks it.
    const { radius, endRadius } = detourBlock((10 + i * 0.25) * (0.5 + Math.min(i, 6) * 0.033));
    const cells = map.cells.slice();
    for (const p of main) {
      if ([s, ...map.goals].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < endRadius)) continue;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (dx * dx + dy * dy <= radius * radius && x >= 0 && y >= 0 && x < map.width && y < map.height) cells[y * map.width + x] = LAND;
        }
    }
    const detour = descend(map, distanceField({ ...map, cells }, map.goals), s);
    const farFromMain = (x: number, y: number) => main.every((p) => Math.hypot(p.x - x, p.y - y) > radius + 1);
    const detourCells = new Set(detour.filter((p) => farFromMain(p.x, p.y)).map((p) => p.y * map.width + p.x));
    expect(detourCells.size).toBeGreaterThan(10);

    const w = createWorld({ ...level, goalEnergy: Number.MAX_SAFE_INTEGER }, { turrets: {} }, [], 1);
    let onDetour = 0;
    for (let t = 0; t < 30 * 120 && w.status === "running"; t++) {
      step(w);
      if (t % 10) continue;
      for (const e of w.enemies) if (detourCells.has(Math.floor(e.y) * map.width + Math.floor(e.x))) onDetour++;
    }
    expect(onDetour).toBeGreaterThan(0);
  }, 120_000);
});
