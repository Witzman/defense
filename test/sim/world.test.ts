import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { canPlace, createWorld, remaining, runToEnd, step, type LevelDef } from "../../src/sim/world.ts";

/** A straight channel along row 1 of a 20x3 map, land above and below. */
function channel(): GameMap {
  const width = 20;
  const height = 3;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let x = 0; x < width; x++) cells[width + x] = WATER;
  return { width, height, cells, spawn: { x: 0, y: 1 }, goal: { x: width - 1, y: 1 } };
}

function level(over: Partial<LevelDef> = {}): LevelDef {
  return {
    map: channel(),
    enemies: { count: 5, perSecond: 2, hp: 3, speed: 4 },
    goalEnergy: 10,
    turret: { range: 3, damage: 1, shotsPerSecond: 4 },
    capacity: 3,
    ...over,
  };
}

describe("goal and energy", () => {
  it("removes an enemy at the goal and takes exactly one energy", () => {
    const w = createWorld(level({ enemies: { count: 1, perSecond: 10, hp: 1, speed: 4 } }), [], 1);
    runToEnd(w);
    expect(w.energy).toBe(9);
    expect(w.enemies.length).toBe(0);
  });

  it("is won when every enemy is handled and energy is left", () => {
    const w = createWorld(level(), [], 1);
    runToEnd(w);
    expect(w.status).toBe("won");
    expect(w.energy).toBe(5);
    expect(w.perfect).toBe(false);
  });

  it("is lost the moment energy hits zero, even with enemies still to come", () => {
    const w = createWorld(level({ goalEnergy: 2, enemies: { count: 50, perSecond: 5, hp: 1, speed: 4 } }), [], 1);
    runToEnd(w);
    expect(w.status).toBe("lost");
    expect(w.energy).toBe(0);
    expect(remaining(w)).toBeGreaterThan(40);
  });
});

describe("remaining", () => {
  it("counts enemies not yet spawned plus the active ones", () => {
    const w = createWorld(level(), [], 1);
    expect(remaining(w)).toBe(5);
    for (let i = 0; i < 30; i++) step(w);
    expect(remaining(w)).toBe(5 - w.arrived - w.killed);
    expect(remaining(w)).toBe(w.toSpawn + w.enemies.length);
  });
});

describe("turrets", () => {
  it("kill what passes in range: a perfect clear", () => {
    const w = createWorld(level({ turret: { range: 3, damage: 1, shotsPerSecond: 8 } }), [{ x: 10, y: 0 }], 1);
    runToEnd(w);
    expect(w.status).toBe("won");
    expect(w.killed).toBe(5);
    expect(w.perfect).toBe(true);
  });

  it("do nothing to enemies out of range", () => {
    const w = createWorld(level({ map: tall() }), [{ x: 10, y: 0 }], 1);
    runToEnd(w);
    expect(w.killed).toBe(0);
  });

  it("stand only on free land, up to the capacity", () => {
    const l = level();
    expect(canPlace(l, [], { x: 3, y: 0 })).toBe(true);
    expect(canPlace(l, [], { x: 3, y: 1 })).toBe(false);
    expect(canPlace(l, [{ x: 3, y: 0 }], { x: 3, y: 0 })).toBe(false);
    expect(canPlace(l, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }], { x: 5, y: 0 })).toBe(false);
    expect(canPlace(l, [], { x: -1, y: 0 })).toBe(false);
  });

  it("do not save up shots while nothing is in range", () => {
    // Enemies arrive in range only after a long, idle wait; a turret that banked its cooldown would fire a burst.
    const w = createWorld(level({ enemies: { count: 1, perSecond: 10, hp: 100, speed: 1 } }), [{ x: 15, y: 0 }], 1);
    let firstVolley = -1;
    while (w.status === "running" && firstVolley < 0) {
      step(w);
      if (w.shots.length > 0) firstVolley = w.shots.length;
    }
    expect(firstVolley).toBe(1);
    let shotsInFirstSecond = 1;
    for (let i = 1; i < 30; i++) {
      step(w);
      shotsInFirstSecond += w.shots.length;
    }
    expect(shotsInFirstSecond).toBeLessThanOrEqual(4);
  });

  it("refuse an invalid placement when the run starts", () => {
    expect(() => createWorld(level(), [{ x: 3, y: 1 }], 1)).toThrow();
  });
});

describe("determinism", () => {
  it("replays the same run for the same seed and placements", () => {
    const a = createWorld(level({ enemies: { count: 30, perSecond: 6, hp: 3, speed: 3 } }), [{ x: 8, y: 0 }], 9);
    const b = createWorld(level({ enemies: { count: 30, perSecond: 6, hp: 3, speed: 3 } }), [{ x: 8, y: 0 }], 9);
    runToEnd(a);
    runToEnd(b);
    expect([a.tick, a.killed, a.arrived, a.energy]).toEqual([b.tick, b.killed, b.arrived, b.energy]);
  });
});

/** Channel on row 6 of a 20x7 map, far from a turret on row 0. */
function tall(): GameMap {
  const width = 20;
  const height = 7;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let x = 0; x < width; x++) cells[6 * width + x] = WATER;
  return { width, height, cells, spawn: { x: 0, y: 6 }, goal: { x: width - 1, y: 6 } };
}
