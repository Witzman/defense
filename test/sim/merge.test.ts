import { afterEach, describe, expect, it } from "vitest";
import { BALANCE } from "../../src/content/balance.ts";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type LevelDef } from "../../src/sim/world.ts";

// #44: blobs of one type merge, a big blob sheds a share, a merged blob is a little slower.

function channel(): GameMap {
  const width = 60;
  const height = 5;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let x = 0; x < width; x++) for (let y = 1; y <= 3; y++) cells[y * width + x] = WATER;
  return { width, height, cells, spawns: [{ x: 1, y: 2 }], goals: [{ x: 58, y: 2 }] };
}

const level = (packet = 1): LevelDef => ({
  map: channel(), enemies: { groups: [], speed: 1, packet }, goalEnergy: 1e9, cellCapacity: 6 * packet,
});

const saved = { ...BALANCE };
afterEach(() => Object.assign(BALANCE, saved));

function pool(n: number, type = "green", packet = 1) {
  const w = createWorld(level(packet), { turrets: {} }, [], 1);
  for (let i = 0; i < n; i++) w.spawnBlob(type, packet, 3.5 + (i % 3) * 0.1, 2.5);
  return w;
}

describe("merging (#44)", () => {
  it("blobs of one type in one cell merge, and the total stays", () => {
    const w = pool(4);
    for (let t = 0; t < 30 * 40; t++) step(w);
    expect(w.enemies.length).toBeLessThan(4);
    expect(w.enemies.reduce((s, e) => s + e.size, 0)).toBe(w.active);
    expect(w.active).toBe(4);
  });

  it("different types never merge", () => {
    const w = createWorld(level(), { turrets: {} }, [], 1);
    w.spawnBlob("green", 1, 3.5, 2.5);
    w.spawnBlob("rock", 1, 3.5, 2.5);
    BALANCE.splitRate = 0;
    for (let t = 0; t < 30 * 5; t++) step(w);
    expect(w.enemies.length).toBe(2);
  });

  it("mergeRate 0 leaves everything as before", () => {
    BALANCE.mergeRate = 0;
    BALANCE.splitRate = 0;
    const w = pool(4);
    for (let t = 0; t < 30 * 40; t++) step(w);
    expect(w.enemies.length).toBe(4);
  });

  it("a merged blob holds the pools of its parts and never exceeds a cell", () => {
    BALANCE.splitRate = 0;
    const w = pool(10);
    const hp = w.enemies.reduce((s, e) => s + e.hp, 0);
    for (let t = 0; t < 30 * 20; t++) step(w);
    expect(w.enemies.length).toBeLessThan(10);
    expect(Math.max(...w.enemies.map((e) => e.size))).toBeLessThanOrEqual(6);
    expect(w.enemies.reduce((s, e) => s + e.hp, 0)).toBeCloseTo(hp, 6);
  });

  it("a big blob sheds a share into a new blob with its share of the pool", () => {
    BALANCE.mergeRate = 0;
    const w = createWorld(level(10), { turrets: {} }, [], 1);
    const e = w.spawnBlob("green", 40, 3.5, 2.5);
    const hp = e.hp;
    w.blobsSpawned = 5; // room under the blob count of the spawn
    for (let t = 0; t < 30 * 12; t++) step(w);
    expect(w.enemies.length).toBeGreaterThan(1);
    expect(w.enemies.reduce((s, b) => s + b.size, 0)).toBe(40);
    expect(w.enemies.reduce((s, b) => s + b.hp, 0)).toBeCloseTo(hp, 6);
  });

  it("a big blob is a little slower, but not by much", () => {
    BALANCE.mergeRate = 0;
    BALANCE.splitRate = 0;
    const run = (size: number) => {
      const w = createWorld(level(), { turrets: {} }, [], 1);
      const e = w.spawnBlob("green", size, 3.5, 2.5);
      for (let t = 0; t < 60; t++) step(w);
      return e.x;
    };
    const one = run(1);
    const big = run(6);
    expect(big).toBeLessThan(one);
    expect(big - 3.5).toBeGreaterThan((one - 3.5) * 0.7);
  });

  it("shedding never lifts the blob count above the blobs spawned", () => {
    const w = pool(6);
    let most = 0;
    for (let t = 0; t < 30 * 30; t++) {
      step(w);
      most = Math.max(most, w.enemies.length);
    }
    expect(most).toBeLessThanOrEqual(6);
  });

  it("the same run twice gives the same result", () => {
    const a = pool(8);
    const b = pool(8);
    for (let t = 0; t < 30 * 50; t++) {
      step(a);
      step(b);
    }
    expect(a.enemies.map((e) => [e.id, e.size, e.x])).toEqual(b.enemies.map((e) => [e.id, e.size, e.x]));
  });
});
