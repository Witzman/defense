import { describe, expect, it } from "vitest";
import { ENEMY_TYPES } from "../../src/content/enemies.ts";
import { campaignLevel, learning } from "../../src/content/levels.ts";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, dangerAt, REROUTE_TICKS, step, type LevelDef } from "../../src/sim/world.ts";

// #39: enemies steer round places where many died; a cost, never a wall.

/** Two equally long arms (rows 2 and 8) between a left and a right connector. */
function twoArms(): GameMap {
  const width = 40;
  const height = 11;
  const cells = new Uint8Array(width * height).fill(LAND);
  const wet = (x: number, y: number) => (cells[y * width + x] = WATER);
  for (let x = 0; x < width; x++) {
    wet(x, 2);
    wet(x, 8);
  }
  for (let y = 2; y <= 8; y++) for (const x of [0, 1, 38, 39]) wet(x, y);
  return { width, height, cells, spawns: [{ x: 1, y: 5 }], goals: [{ x: 38, y: 5 }] };
}

function level(learningOf: number): LevelDef {
  return { map: twoArms(), enemies: { groups: [{ type: "swarm", count: 20, perSecond: 2 }], speed: 4, learning: learningOf }, goalEnergy: 1e9, cellCapacity: 50 };
}

/** Rows (2 or 8) the swarm takes while crossing the middle, with danger planted on `scared` row. */
function armTaken(learningOf: number, scared: 2 | 8): Set<number> {
  const w = createWorld(level(learningOf), { turrets: {} }, [], 1);
  const { width } = w.level.map;
  for (let x = 6; x < 34; x++) w.danger[scared * width + x] = 50;
  const rows = new Set<number>();
  for (let t = 0; t < 30 * 30 && w.status === "running"; t++) {
    step(w);
    for (const e of w.enemies) if (e.x > 12 && e.x < 28) rows.add(Math.floor(e.y));
  }
  return rows;
}

describe("danger avoidance (#39)", () => {
  it("a learned swarm leaves the arm where many died, whichever it is", () => {
    expect([...armTaken(1, 2)]).toEqual([8]);
    expect([...armTaken(1, 8)]).toEqual([2]);
  });

  it("without learning danger changes nothing", () => {
    expect(armTaken(0, 2)).toEqual(armTaken(0, 8));
  });

  it("it is a cost, not a wall: the only way stays open", () => {
    const l = level(1);
    const cells = l.map.cells.slice();
    for (let x = 6; x < 34; x++) cells[8 * l.map.width + x] = LAND;
    const w = createWorld({ ...l, map: { ...l.map, cells } }, { turrets: {} }, [], 1);
    for (let x = 6; x < 34; x++) w.danger[2 * l.map.width + x] = 1e6;
    for (let t = 0; t < 30 * 60 && w.status === "running"; t++) step(w);
    expect(w.arrived).toBeGreaterThan(0);
  });

  it("deaths raise danger, which spreads and fades", () => {
    const w = createWorld(level(1), { turrets: {} }, [], 1);
    expect(w.danger.every((d) => d === 0)).toBe(true);
    const i = 5 * w.level.map.width + 10;
    w.danger[i] = 20;
    const before = dangerAt(w, i);
    for (let t = 0; t < REROUTE_TICKS * 3; t++) step(w);
    expect(dangerAt(w, i)).toBeLessThan(before);
    expect(dangerAt(w, i + 1)).toBeGreaterThan(0);
    for (let t = 0; t < REROUTE_TICKS * 400; t++) step(w);
    expect(w.danger.every((d) => d < 1)).toBe(true);
  });

  it("the campaign teaches it: nothing in the first levels, all at the end; a type may care or not", () => {
    expect(learning(0)).toBe(0);
    expect(learning(2)).toBe(0);
    expect(learning(24)).toBe(1);
    expect(learning(10)).toBeGreaterThan(learning(5));
    expect(campaignLevel(24).enemies.learning).toBe(1);
    expect(campaignLevel(0).enemies.learning).toBe(0);
    for (const t of ENEMY_TYPES) expect(t.dangerAvoidance).toBeGreaterThanOrEqual(0);
    const by = (id: string) => ENEMY_TYPES.find((t) => t.id === id)!.dangerAvoidance;
    expect(by("swarm")).toBeGreaterThan(by("green"));
    expect(by("rock")).toBeLessThan(by("green"));
  });
});
