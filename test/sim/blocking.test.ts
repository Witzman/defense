import { afterEach, describe, expect, it } from "vitest";
import { BALANCE } from "../../src/content/balance.ts";
import { enemyType, enemyWeight } from "../../src/content/enemies.ts";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type LevelDef } from "../../src/sim/world.ts";

// #45: the heavier type has priority; the lighter one gives way and flows past, or waits.

function channel(rows: number): GameMap {
  const width = 60;
  const height = rows + 2;
  const cells = new Uint8Array(width * height).fill(LAND);
  for (let x = 0; x < width; x++) for (let y = 1; y <= rows; y++) cells[y * width + x] = WATER;
  const my = 1 + Math.floor(rows / 2);
  return { width, height, cells, spawns: [{ x: 1, y: my }], goals: [{ x: 58, y: my }] };
}
const level = (rows: number): LevelDef => ({ map: channel(rows), enemies: { groups: [], speed: 3 }, goalEnergy: 1e9, cellCapacity: 100 });

/** A rock ahead, a swarm behind it; returns the swarm's x after `ticks`. */
function swarmX(rows: number, ticks: number): number {
  const w = createWorld(level(rows), { turrets: {} }, [], 1);
  const my = w.level.map.spawns[0]!.y + 0.5;
  w.spawnBlob("rock", 1, 6.5, my);
  const s = w.spawnBlob("swarm", 1, 3.5, my);
  for (let t = 0; t < ticks; t++) step(w);
  return s.x;
}

const saved = BALANCE.passPenalty;
afterEach(() => (BALANCE.passPenalty = saved));

describe("type blocking (#45)", () => {
  it("weights follow hp and speed: rock heaviest, swarm lightest", () => {
    expect(enemyWeight(enemyType("rock"))).toBeGreaterThan(enemyWeight(enemyType("armor")));
    expect(enemyWeight(enemyType("swarm"))).toBeLessThan(enemyWeight(enemyType("green")));
  });

  it("a rock holds a swarm up more in a narrow channel than the penalty alone would", () => {
    BALANCE.passPenalty = 0;
    const free = swarmX(1, 80);
    BALANCE.passPenalty = 0.3;
    expect(swarmX(1, 80)).toBeLessThan(free);
  });

  it("in a wide channel the swarm steps aside and loses less than behind the rock in a narrow one", () => {
    BALANCE.passPenalty = 0.3;
    const run = (rows: number) => {
      const w = createWorld(level(rows), { turrets: {} }, [], 1);
      const my = w.level.map.spawns[0]!.y + 0.5;
      const rock = w.spawnBlob("rock", 1, 6.5, my);
      const swarm = w.spawnBlob("swarm", 1, 3.5, my);
      for (let t = 0; t < 200; t++) step(w);
      return { swarm, rock };
    };
    const narrow = run(1);
    const wide = run(5);
    expect(wide.swarm.x).toBeGreaterThan(narrow.swarm.x + 1);
    expect(Math.abs(wide.swarm.y - wide.rock.y)).toBeGreaterThan(0.5);
  });

  it("penalty 0 is the old behaviour: a heavy blob in the way changes nothing but cohesion", () => {
    // Two worlds, one where the rock is a green of the same pace: with penalty 0 the swarm cannot tell them apart.
    BALANCE.passPenalty = 0;
    const run = (type: string) => {
      const w = createWorld(level(3), { turrets: {} }, [], 1);
      const my = w.level.map.spawns[0]!.y + 0.5;
      const front = w.spawnBlob(type, 1, 6.5, my);
      front.speed = front.baseSpeed = 0.6 * 3;
      const s = w.spawnBlob("swarm", 1, 3.5, my);
      for (let t = 0; t < 100; t++) step(w);
      return s.x;
    };
    expect(run("rock")).toBe(run("green"));
  });

  it("the same run twice gives the same result", () => {
    BALANCE.passPenalty = 0.3;
    expect(swarmX(3, 120)).toBe(swarmX(3, 120));
  });

  it("no deadlock: everything arrives in a channel with a rock in front", () => {
    for (const rows of [1, 3]) {
      BALANCE.passPenalty = 0.4;
      const w = createWorld(level(rows), { turrets: {} }, [], 1);
      const my = w.level.map.spawns[0]!.y + 0.5;
      w.spawnBlob("rock", 1, 5.5, my);
      for (const t of ["swarm", "green", "armor", "shield", "swarm"]) w.spawnBlob(t, 1, 2.5, my);
      for (let t = 0; t < 6000 && w.enemies.length > 0; t++) step(w);
      expect(w.enemies.length).toBe(0);
    }
  });
});
