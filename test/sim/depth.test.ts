import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { ENEMY_TYPES, enemyType } from "../../src/content/enemies.ts";
import { depthField, distanceField } from "../../src/sim/flow.ts";
import { descend, LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type LevelDef } from "../../src/sim/world.ts";

// #27: enemies prefer deep water, each type as strongly as its depthPreference says.

/** Land everywhere, with water carved in rectangles [x0, x1] × [y0, y1]. */
function carve(width: number, height: number, rects: [number, number, number, number][], spawn: [number, number], goal: [number, number]): GameMap {
  const cells = new Uint8Array(width * height).fill(LAND);
  for (const [x0, x1, y0, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * width + x] = WATER;
  return { width, height, cells, spawns: [{ x: spawn[0], y: spawn[1] }], goals: [{ x: goal[0], y: goal[1] }] };
}

/**
 * Two arms between a left and a right connector (5 cells wide): the top arm is 7 cells wide (rows 1–7, deep in the
 * middle), the bottom arm a single shallow row. The spawn sits in the left connector, the goal in the right one.
 * At `spawnY` 10 both arms are equally long (row 7 and row 13 lie 3 rows away); at 11 the shallow one is shorter.
 */
function twoArms(spawnY: number): GameMap {
  return carve(40, 16, [[0, 39, 1, 7], [0, 39, 13, 13], [0, 4, 1, 13], [35, 39, 1, 13]], [2, spawnY], [37, spawnY]);
}

const DEEP_ROWS = [1, 2, 3, 4, 5, 6, 7];
const SHALLOW_ROW = 13;
/** Cells strictly between the connectors, where the arms are apart. */
const inArms = (x: number) => x > 6 && x < 33;

function level(map: GameMap, groups: LevelDef["enemies"]["groups"]): LevelDef {
  return { map, enemies: { groups, speed: 4 }, goalEnergy: 1e9, cellCapacity: 50 };
}

/** Rows each type's blobs visit inside the arms over a whole run. */
function rowsTaken(map: GameMap, groups: LevelDef["enemies"]["groups"], seed = 1): Map<string, Set<number>> {
  const w = createWorld(level(map, groups), { turrets: {} }, [], seed);
  const rows = new Map<string, Set<number>>();
  for (let t = 0; t < 30 * 120 && w.status === "running"; t++) {
    step(w);
    for (const e of w.enemies) {
      if (!inArms(Math.floor(e.x))) continue;
      if (!rows.has(e.type)) rows.set(e.type, new Set());
      rows.get(e.type)!.add(Math.floor(e.y));
    }
  }
  expect(w.status).toBe("won");
  return rows;
}

describe("water depth", () => {
  it("is 1 on the shore, grows toward the middle, and counts the map edge as land", () => {
    const map = carve(9, 9, [[0, 8, 0, 8]], [0, 0], [8, 8]);
    const depth = depthField(map);
    expect(depth[0]).toBe(1);
    expect(depth[4 * 9 + 4]).toBe(5);
    expect(depth[2 * 9 + 4]).toBe(3);
  });

  it("is 0 on land and the same for every world on the map", () => {
    const map = twoArms(10);
    const depth = depthField(map);
    expect(depth[0]).toBe(0);
    expect(depth[4 * 40 + 20]).toBe(4);
    expect(depth[SHALLOW_ROW * 40 + 20]).toBe(1);
    const w = createWorld(level(map, [{ type: "green", count: 1, perSecond: 1 }]), { turrets: {} }, [], 1);
    expect(w.depth).toEqual(depth);
  });
});

describe("enemies prefer deep water (#27)", () => {
  it("every type has a preference; Fels keeps deepest, Schwarm is indifferent", () => {
    for (const t of ENEMY_TYPES) expect(t.depthPreference).toBeGreaterThanOrEqual(0);
    const max = Math.max(...ENEMY_TYPES.map((t) => t.depthPreference));
    expect(enemyType("rock").depthPreference).toBe(max);
    expect(enemyType("swarm").depthPreference).toBe(0);
  });

  it("the two arms are equally long, so only depth tells them apart", () => {
    const map = twoArms(10);
    const fromSpawn = distanceField(map, map.spawns);
    const toGoal = distanceField(map, map.goals);
    const via = (x: number, y: number) => fromSpawn[y * 40 + x]! + toGoal[y * 40 + x]!;
    expect(via(20, 7)).toBeCloseTo(via(20, SHALLOW_ROW), 9);
  });

  it("a deep-preferring type takes the deep arm, though the shallow one is just as long", () => {
    const rows = rowsTaken(twoArms(10), [{ type: "rock", count: 20, perSecond: 4 }]);
    expect([...rows.get("rock")!].every((y) => DEEP_ROWS.includes(y))).toBe(true);
    // It keeps to the middle of the deep arm, not to its shore.
    expect(rows.get("rock")!.has(4)).toBe(true);
  });

  it("an indifferent type pays nothing for shallow water: its route is the plain shortest path", () => {
    const map = twoArms(10);
    const w = createWorld(level(map, [{ type: "swarm", count: 1, perSecond: 1 }]), { turrets: {} }, [], 1);
    expect(w.routes).toHaveLength(1);
    expect(w.routes[0]!.shore).toBeUndefined();
    expect(w.routeOf.get("swarm")!.field).toEqual(distanceField(map, map.goals));
  });

  it("with the shallow arm a little shorter, the swarm takes it and the rock still goes deep", () => {
    const map = twoArms(11);
    const rows = rowsTaken(map, [
      { type: "swarm", count: 20, perSecond: 4 },
      { type: "rock", count: 20, perSecond: 4 },
    ]);
    expect([...rows.get("swarm")!]).toEqual([SHALLOW_ROW]);
    expect([...rows.get("rock")!].every((y) => DEEP_ROWS.includes(y))).toBe(true);
  });

  it("types with the same preference share one route field; a level gets one field per distinct preference", () => {
    const w = createWorld(
      level(twoArms(10), ["green", "ember", "shield", "rock", "swarm"].map((type) => ({ type, count: 1, perSecond: 1 }))),
      { turrets: {} }, [], 1,
    );
    expect(w.routes.map((r) => r.preference)).toEqual([1, 4, 0]);
    expect(w.routeOf.get("green")).toBe(w.routeOf.get("ember"));
    expect(w.routeOf.get("green")).toBe(w.routeOf.get("shield"));
    expect(w.routeOf.get("rock")).not.toBe(w.routeOf.get("green"));
  });

  it("a type that is not in the level gets its route when its first blob appears", () => {
    const map = twoArms(10);
    const w = createWorld(level(map, [{ type: "swarm", count: 1, perSecond: 1 }]), { turrets: {} }, [], 1);
    w.spawnBlob("rock", 1, 2.5, 10.5);
    expect(w.routes).toHaveLength(2);
    for (let t = 0; t < 30 * 60 && w.status === "running"; t++) step(w);
    expect(w.arrived).toBe(2);
  });
});

describe("depth is a cost, never a wall", () => {
  it("a deep-preferring type still reaches the goal through a 1-cell shallow channel", () => {
    // Two wide basins joined only by a channel one cell wide and 20 long.
    const map = carve(50, 15, [[0, 12, 0, 14], [37, 49, 0, 14], [13, 36, 7, 7]], [2, 7], [47, 7]);
    const w = createWorld(level(map, [{ type: "rock", count: 15, perSecond: 5 }]), { turrets: {} }, [], 1);
    const route = w.routeOf.get("rock")!;
    expect(Number.isFinite(route.field[7 * 50 + 2]!)).toBe(true);
    expect(descend(map, route.field, { x: 2, y: 7 }).at(-1)).toEqual({ x: 47, y: 7 });
    for (let t = 0; t < 30 * 120 && w.status === "running"; t++) step(w);
    expect(w.status).toBe("won");
    expect(w.arrived).toBe(15);
  });
});

describe("determinism with several route fields", () => {
  it("the same seed gives the same run on a level with several types", () => {
    const i = LEVELS.findIndex((l) => new Set(l().enemies.groups.map((g) => enemyType(g.type).depthPreference)).size >= 3);
    expect(i).toBeGreaterThanOrEqual(0);
    const run = () => {
      const w = createWorld({ ...LEVELS[i]!(), goalEnergy: Number.MAX_SAFE_INTEGER }, { turrets: {} }, [], 7);
      for (let t = 0; t < 30 * 40; t++) step(w);
      return { enemies: w.enemies.map((e) => [e.id, e.type, e.x, e.y, e.size]), fields: w.routes.map((r) => Array.from(r.field)) };
    };
    expect(run()).toEqual(run());
  }, 60_000);
});
