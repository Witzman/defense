import { describe, expect, it } from "vitest";
import { LAND, cellAt } from "../../src/sim/map.ts";
import { LEVELS } from "../../src/content/levels.ts";
import { LAND_REACH, shoreField, wobble } from "../../src/render/terrain.ts";

describe("shore field (#16)", () => {
  it("is negative on every land cell and positive on every water cell, on every level", () => {
    let wrong = 0;
    for (const make of LEVELS) {
      const map = make().map;
      const f = shoreField(map);
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const v = f(x + 0.5, y + 0.5);
          if ((cellAt(map, x, y) === LAND) !== v < 0) wrong++;
        }
    }
    expect(wrong).toBe(0);
  }, 60_000);

  // The mass is cut off where the field drops below LAND_REACH (fluid.ts); the coast is drawn where field + wobble
  // crosses zero (terrain.ts). As long as the wobble stays under LAND_REACH, no part of the mass can lie on drawn land.
  it("keeps the coast's wobble inside LAND_REACH, so the mass never covers drawn land (#11)", () => {
    let max = 0;
    for (let y = 0; y < 200; y += 0.37) for (let x = 0; x < 200; x += 0.41) max = Math.max(max, Math.abs(wobble(x, y)));
    expect(max).toBeLessThan(LAND_REACH);
    expect(max).toBeGreaterThan(LAND_REACH / 2);
  });
});
