import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, remaining, runToEnd, step, type LevelDef } from "../../src/sim/world.ts";

function channel(width = 20): GameMap {
  const height = 3;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let x = 0; x < width; x++) cells[width + x] = WATER;
  return { width, height, cells, spawn: { x: 0, y: 1 }, goal: { x: width - 1, y: 1 } };
}

function level(over: Partial<LevelDef["enemies"]> = {}, rest: Partial<LevelDef> = {}): LevelDef {
  return {
    map: channel(),
    enemies: { count: 100, perSecond: 50, hp: 2, speed: 4, packet: 10, ...over },
    goalEnergy: 1000,
    turret: { range: 3, damage: 1, shotsPerSecond: 30 },
    capacity: 3,
    cellCapacity: 20,
    ...rest,
  };
}

describe("packets: one simulated blob stands for many enemies", () => {
  it("spawns the count in packets and counts remaining in enemies", () => {
    const w = createWorld(level(), [], 1);
    expect(remaining(w)).toBe(100);
    for (let i = 0; i < 10; i++) step(w);
    expect(w.enemies.every((e) => e.size === 10)).toBe(true);
    expect(remaining(w)).toBe(100);
  });

  it("a packet at the goal takes one energy per enemy in it", () => {
    const w = createWorld(level(), [], 1);
    runToEnd(w);
    expect(w.arrived).toBe(100);
    expect(w.energy).toBe(900);
  });

  it("damage kills members one by one, at hp per member", () => {
    const w = createWorld(level({ count: 10, perSecond: 100, packet: 10, hp: 2, speed: 1 }), [{ x: 2, y: 0 }], 1);
    let shots = 0;
    while (w.status === "running" && w.killed < 3) {
      step(w);
      shots += w.shots.length;
    }
    expect(w.killed).toBe(3);
    expect(shots).toBe(6);
    expect(w.enemies[0]!.size).toBe(7);
  });

  it("the last packet is only as big as what is left", () => {
    const w = createWorld(level({ count: 25, packet: 10 }), [], 1);
    for (let i = 0; i < 60; i++) step(w);
    expect(w.enemies.map((e) => e.size).sort((a, b) => a - b)[0]).toBe(5);
  });

  it("a cell holds at most its capacity in enemies, not in packets", () => {
    const w = createWorld(level({ count: 400, perSecond: 200, packet: 10, speed: 2 }, { cellCapacity: 20 }), [], 1);
    while (w.status === "running") {
      step(w);
      const load = new Map<number, number>();
      for (const e of w.enemies) {
        const c = Math.floor(e.y) * 20 + Math.floor(e.x);
        load.set(c, (load.get(c) ?? 0) + e.size);
      }
      load.delete(20); // spawn cell holds the queue at the tap
      for (const n of load.values()) expect(n).toBeLessThanOrEqual(20);
    }
  });

  it("is lost when energy runs out, even mid-packet", () => {
    const w = createWorld(level({ packet: 10 }, { goalEnergy: 15 }), [], 1);
    runToEnd(w);
    expect(w.status).toBe("lost");
    expect(w.energy).toBe(0);
  });
});
