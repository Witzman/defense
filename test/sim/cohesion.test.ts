import { afterEach, describe, expect, it } from "vitest";
import { BALANCE } from "../../src/content/balance.ts";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type LevelDef } from "../../src/sim/world.ts";

// #40: blobs in one cell stick together: a fast type cannot run through a slow one.

function channel(): GameMap {
  const width = 60;
  const height = 5;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let x = 0; x < width; x++) for (let y = 1; y <= 3; y++) cells[y * width + x] = WATER;
  return { width, height, cells, spawns: [{ x: 1, y: 2 }], goals: [{ x: 58, y: 2 }] };
}

const level = (): LevelDef => ({ map: channel(), enemies: { groups: [], speed: 3 }, goalEnergy: 1e9, cellCapacity: 100 });

/** Gap in cells between a swarm (fast) and a rock (slow) that started in the same spot, after `ticks`. */
function gap(ticks: number): number {
  const w = createWorld(level(), { turrets: {} }, [], 1);
  const fast = w.spawnBlob("swarm", 1, 3.5, 2.5);
  const slow = w.spawnBlob("rock", 1, 3.5, 2.5);
  for (let t = 0; t < ticks; t++) step(w);
  return Math.abs(fast.x - slow.x);
}

const saved = BALANCE.cohesion;
afterEach(() => (BALANCE.cohesion = saved));

describe("cohesion (#40)", () => {
  it("without it a fast blob leaves a slow one behind quickly", () => {
    BALANCE.cohesion = 0;
    expect(gap(60)).toBeGreaterThan(3);
  });

  it("with it they travel closer together, and the fast one is held back", () => {
    BALANCE.cohesion = 0;
    const free = gap(60);
    BALANCE.cohesion = 0.8;
    expect(gap(60)).toBeLessThan(free * 0.5);
  });

  it("the same run twice gives the same result", () => {
    BALANCE.cohesion = 0.8;
    expect(gap(90)).toBe(gap(90));
  });

  it("a slowed blob holds back its cell", () => {
    BALANCE.cohesion = 0.8;
    const alone = createWorld(level(), { turrets: {} }, [], 1);
    const a = alone.spawnBlob("green", 1, 3.5, 2.5);
    const pair = createWorld(level(), { turrets: {} }, [], 1);
    const b = pair.spawnBlob("green", 1, 3.5, 2.5);
    const c = pair.spawnBlob("green", 1, 3.5, 2.5);
    c.speed = c.baseSpeed * 0.2;
    c.slowUntil = 1e9;
    for (let t = 0; t < 60; t++) {
      step(alone);
      step(pair);
    }
    expect(b.x).toBeLessThan(a.x);
  });
});
