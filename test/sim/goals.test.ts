import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, runToEnd, step, type LevelDef } from "../../src/sim/world.ts";

/**
 * A plus-shaped channel: spawns at the left and top ends, goals at the right and bottom ends.
 *          S1(5,0)
 *            |
 *  S0(0,5) --+-- G0(10,5)
 *            |
 *          G1(5,10)
 */
function cross(): GameMap {
  const width = 11;
  const height = 11;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let i = 0; i < 11; i++) {
    cells[5 * width + i] = WATER;
    cells[i * width + 5] = WATER;
  }
  return { width, height, cells, spawns: [{ x: 0, y: 5 }, { x: 5, y: 0 }], goals: [{ x: 10, y: 5 }, { x: 5, y: 10 }] };
}

function level(groups: LevelDef["enemies"]["groups"], goalEnergy = 100): LevelDef {
  return { map: cross(), enemies: { groups, speed: 3 }, goalEnergy, cellCapacity: 20 };
}

describe("several spawns and goals", () => {
  it("a group flows out of the spawn it names", () => {
    const w = createWorld(level([{ type: "green", count: 1, perSecond: 10, spawn: 1 }]), { turrets: {} }, [], 1);
    while (w.enemies.length === 0) step(w);
    expect(Math.floor(w.enemies[0]!.y)).toBe(0);
    expect(Math.floor(w.enemies[0]!.x)).toBe(5);
  });

  it("every goal has its own energy, and an enemy takes it from the goal it reaches", () => {
    const w = createWorld(level([{ type: "green", count: 3, perSecond: 10 }]), { turrets: {} }, [], 1);
    runToEnd(w);
    expect(w.energies.reduce((a, b) => a + b, 0)).toBe(200 - 3);
    expect(w.energies.some((e) => e === 100)).toBe(true);
  });

  it("is lost when one goal runs dry, though another is full", () => {
    const w = createWorld(level([{ type: "green", count: 20, perSecond: 20 }], 5), { turrets: {} }, [], 1);
    runToEnd(w);
    expect(w.status).toBe("lost");
    expect(Math.min(...w.energies)).toBe(0);
  });

  it("is perfect only with every goal full", () => {
    const w = createWorld(level([{ type: "green", count: 1, perSecond: 10 }]), { turrets: {} }, [], 1);
    runToEnd(w);
    expect(w.status).toBe("won");
    expect(w.perfect).toBe(false);
  });
});
