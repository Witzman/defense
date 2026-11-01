import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { createWorld, runToEnd, type Arsenal } from "../../src/sim/world.ts";
import { turretType } from "../../src/content/turrets.ts";
import { placeGreedy, sampleFlow } from "../../src/balance/placement.ts";

describe("the same set-up plays the same run (#28)", () => {
  const arsenal: Arsenal = { turrets: { cannon: { capacity: 4, stats: turretType("cannon").base } } };

  it("repeats a level's run exactly, try after try", () => {
    const level = LEVELS[2]!();
    const placements = placeGreedy(level, arsenal, sampleFlow(level), ["cannon"]);
    const outcome = () => {
      const w = createWorld(level, arsenal, placements);
      runToEnd(w);
      return { status: w.status, tick: w.tick, killed: w.killed, arrived: w.arrived, energies: [...w.energies] };
    };
    expect(outcome()).toEqual(outcome());
  }, 60_000);

  it("gives every level its own run", () => {
    const seeds = LEVELS.map((make) => make().runSeed);
    expect(new Set(seeds).size).toBe(LEVELS.length);
    expect(seeds.every((s) => s !== undefined)).toBe(true);
  }, 60_000);
});
