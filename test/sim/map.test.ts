import { describe, expect, it } from "vitest";
import { generateMap, LAND, WATER, cellAt } from "../../src/sim/map.ts";
import { distanceField, UNREACHABLE } from "../../src/sim/flow.ts";

const seeds = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
const params = { width: 48, height: 32 };

describe("map generator", () => {
  it("is deterministic per seed", () => {
    expect(generateMap({ ...params, seed: 5 }).cells).toEqual(generateMap({ ...params, seed: 5 }).cells);
  });

  it.each(seeds)("seed %i: spawn and goal lie on water and the spawn reaches the goal", (seed) => {
    const map = generateMap({ ...params, seed });
    expect(cellAt(map, map.spawns[0]!.x, map.spawns[0]!.y)).toBe(WATER);
    expect(cellAt(map, map.goals[0]!.x, map.goals[0]!.y)).toBe(WATER);
    const field = distanceField(map, map.goals);
    expect(field[map.spawns[0]!.y * map.width + map.spawns[0]!.x]).not.toBe(UNREACHABLE);
  });

  it.each(seeds)("seed %i: every water cell reaches the goal (no dead pockets)", (seed) => {
    const map = generateMap({ ...params, seed });
    const field = distanceField(map, map.goals);
    for (let i = 0; i < map.cells.length; i++) {
      if (map.cells[i] === WATER) expect(field[i]).not.toBe(UNREACHABLE);
    }
  });

  it.each(seeds)("seed %i: land and water both take a real share of the map", (seed) => {
    const map = generateMap({ ...params, seed });
    const land = map.cells.filter((c) => c === LAND).length / map.cells.length;
    expect(land).toBeGreaterThan(0.25);
    expect(land).toBeLessThan(0.75);
  });

  it.each(seeds)("seed %i: there is buildable land next to the water", (seed) => {
    const map = generateMap({ ...params, seed });
    let shore = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if (cellAt(map, x, y) === LAND && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cellAt(map, x + dx!, y + dy!) === WATER)) shore++;
    expect(shore).toBeGreaterThan(30);
  });
});

describe("distance field", () => {
  it("is 0 at the goal and grows by one per straight step", () => {
    const map = { width: 5, height: 1, cells: new Uint8Array(5).fill(WATER), spawns: [{ x: 0, y: 0 }], goals: [{ x: 4, y: 0 }] };
    const field = distanceField(map, map.goals);
    expect(Array.from(field)).toEqual([4, 3, 2, 1, 0]);
  });

  it("does not cross land", () => {
    const cells = new Uint8Array([WATER, LAND, WATER]);
    const map = { width: 3, height: 1, cells, spawns: [{ x: 0, y: 0 }], goals: [{ x: 2, y: 0 }] };
    expect(distanceField(map, map.goals)[0]).toBe(UNREACHABLE);
  });

  it("does not cut diagonally between two land corners", () => {
    // W L
    // L W   — the two water cells touch only at a corner
    const cells = new Uint8Array([WATER, LAND, LAND, WATER]);
    const map = { width: 2, height: 2, cells, spawns: [{ x: 0, y: 0 }], goals: [{ x: 1, y: 1 }] };
    expect(distanceField(map, map.goals)[0]).toBe(UNREACHABLE);
  });
});
