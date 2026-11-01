import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, DT, remaining, runToEnd, step, useAbility, type Arsenal, type LevelDef, type Placement } from "../../src/sim/world.ts";
import { turretType, type TurretKind } from "../../src/content/turrets.ts";

/** Open water 30x9 with a land strip on row 0; enemies flow left to right along row 4. */
function lake(): GameMap {
  const width = 30;
  const height = 9;
  const cells = new Uint8Array(width * height).fill(WATER);
  for (let x = 0; x < width; x++) cells[x] = LAND;
  return { width, height, cells, spawns: [{ x: 0, y: 4 }], goals: [{ x: width - 1, y: 4 }] };
}

function level(type: string, count = 1, over: Partial<LevelDef["enemies"]> & { perSecond?: number } = {}): LevelDef {
  const { perSecond = 100, ...rest } = over;
  return { map: lake(), enemies: { groups: [{ type, count, perSecond }], speed: 2, ...rest }, goalEnergy: 1000, cellCapacity: 50 };
}

function armed(kind: TurretKind, stats: Partial<ReturnType<typeof turretType>["base"]> = {}): Arsenal {
  return { turrets: { [kind]: { capacity: 5, stats: { ...turretType(kind).base, turnRate: 1e6, ...stats } } } };
}

/** Steps until the first blob is in the water and returns it. */
function firstBlob(w: ReturnType<typeof createWorld>) {
  while (w.enemies.length === 0) step(w);
  return w.enemies[0]!;
}

describe("damage types and resistances", () => {
  it("armour takes 40 % of kinetic damage", () => {
    const w = createWorld(level("armor", 1, { hpScale: 10 }), armed("cannon"), [], 1);
    const e = firstBlob(w);
    const before = e.hp;
    w.hit(e, 5, "kinetic");
    expect(before - e.hp).toBeCloseTo(2);
  });

  it("ember is immune to fire and a flamer does not waste itself on it", () => {
    const w = createWorld(level("ember", 3), armed("flamer", { range: 30 }), [{ x: 3, y: 0, kind: "flamer" }], 1);
    runToEnd(w);
    expect(w.killed).toBe(0);
  });

  it("a shield soaks damage first; electric damage breaks it three times as fast", () => {
    const w = createWorld(level("shield", 1, { hpScale: 1 }), armed("cannon"), [], 1);
    const e = firstBlob(w);
    expect(e.shield).toBe(2);
    w.hit(e, 1, "kinetic");
    expect(e.shield).toBeCloseTo(1);
    expect(e.hp).toBe(1);
    w.hit(e, 1, "electric");
    expect(e.shield).toBe(0);
    expect(e.hp).toBeCloseTo(1 - 2 / 3); // 1 electric = 3 against the 1 shield left; the remaining 2/3 of the hit reaches hp
  });
});

describe("weapon patterns", () => {
  it("fire keeps burning after the flame is gone", () => {
    const w = createWorld(level("green", 1, { hpScale: 10 }), armed("flamer", { damage: 2, range: 4.5 }), [{ x: 5, y: 0, kind: "flamer" }], 1);
    const e = firstBlob(w);
    while (w.status === "running" && e.x < 10) step(w);
    const hpLeftCone = e.hp;
    expect(hpLeftCone).toBeLessThan(10); // the flame did reach it
    for (let i = 0; i < 15; i++) step(w);
    expect(e.hp).toBeLessThan(hpLeftCone);
  });

  it("a mortar hits every blob around the impact, none beyond", () => {
    const w = createWorld(level("green", 1, { hpScale: 100 }), armed("mortar"), [], 1);
    for (let i = 0; i < 3; i++) step(w);
    const [a] = w.enemies;
    const near = w.spawnBlob("green", 1, a!.x + 0.5, a!.y);
    const far = w.spawnBlob("green", 1, a!.x + 3, a!.y);
    w.splash(a!.x, a!.y, 1.2, 5, "explosive");
    expect(a!.hp).toBeLessThan(100);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
  });

  it("tesla jumps to several targets", () => {
    const w = createWorld(level("green", 6, { hpScale: 100 }), armed("tesla", { range: 30, shotsPerSecond: 1 }), [], 1);
    while (w.enemies.length < 6) step(w);
    w.place({ x: 10, y: 0, kind: "tesla" });
    step(w);
    expect(w.enemies.filter((e) => e.hp < 100).length).toBe(4); // first target + 3 jumps
  });

  it("a laser kills one member per shot, but not rock", () => {
    const w = createWorld(level("green", 10, { packet: 10 }), armed("laser", { range: 30, shotsPerSecond: 3 }), [{ x: 10, y: 0, kind: "laser" }], 1);
    let shots = 0;
    while (w.status === "running" && w.killed < 4) {
      step(w);
      shots += w.shots.length;
    }
    expect(w.killed).toBe(4);
    expect(shots).toBe(4);
    const r = createWorld(level("rock", 5), armed("laser", { range: 30, shotsPerSecond: 30 }), [{ x: 10, y: 0, kind: "laser" }], 1);
    runToEnd(r);
    expect(r.killed).toBe(0);
  });

  it("an absurd fire rate is aggregated: everything in range dies in one tick, quickly", () => {
    const w = createWorld(level("green", 2000, { hpScale: 5, packet: 10, perSecond: 1e6 }), armed("cannon", { range: 100, shotsPerSecond: 1e8 }), [], 1);
    step(w);
    expect(remaining(w)).toBe(2000);
    w.place({ x: 10, y: 0, kind: "cannon" });
    const t0 = performance.now();
    step(w);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(w.killed).toBe(2000);
  });
});

describe("swivel arc", () => {
  it("ignores enemies outside its arc", () => {
    // Facing up (away from the water), a 90° arc never sees row 4.
    const w = createWorld(level("green", 5), armed("cannon", { range: 30, arc: 90 }), [{ x: 10, y: 0, kind: "cannon", facing: -90 }], 1);
    runToEnd(w);
    expect(w.killed).toBe(0);
  });

  it("must turn before it fires, at its swivel rate", () => {
    const slow = createWorld(level("green", 1), armed("cannon", { range: 30, turnRate: 30 }), [{ x: 10, y: 0, kind: "cannon", facing: 0 }], 1);
    const fast = createWorld(level("green", 1), armed("cannon", { range: 30, turnRate: 3600 }), [{ x: 10, y: 0, kind: "cannon", facing: 0 }], 1);
    const firstShot = (w: typeof slow) => {
      while (w.status === "running" && w.shots.length === 0) step(w);
      return w.tick;
    };
    expect(firstShot(slow)).toBeGreaterThan(firstShot(fast) + 30);
  });
});

describe("enemy groups", () => {
  it("spawn as coloured groups in order, at their own start times", () => {
    const l: LevelDef = {
      map: lake(),
      enemies: { groups: [{ type: "green", count: 3, perSecond: 10 }, { type: "armor", count: 2, perSecond: 10, start: 2 }], speed: 2 },
      goalEnergy: 100,
    };
    const w = createWorld(l, { turrets: {} }, [], 1);
    expect(remaining(w)).toBe(5);
    for (let i = 0; i < Math.round(1.5 / DT); i++) step(w);
    expect(w.enemies.map((e) => e.type)).toEqual(["green", "green", "green"]);
    for (let i = 0; i < Math.round(1 / DT); i++) step(w);
    expect(w.enemies.filter((e) => e.type === "armor").length).toBe(2);
  });
});

describe("mouse ability", () => {
  it("hits a small area once, then needs its cooldown", () => {
    const w = createWorld(level("green", 1, { hpScale: 1 }), { turrets: {}, ability: { damage: 1, radius: 1, cooldown: 2 } }, [], 1);
    const e = firstBlob(w);
    expect(useAbility(w, e.x, e.y)).toBe(true);
    expect(w.killed).toBe(1);
    expect(useAbility(w, e.x, e.y)).toBe(false);
  });
});

describe("placement", () => {
  it("counts capacity per turret kind", async () => {
    const { canPlace } = await import("../../src/sim/world.ts");
    const l = level("green");
    const a: Arsenal = { turrets: { cannon: { capacity: 1, stats: turretType("cannon").base }, mortar: { capacity: 1, stats: turretType("mortar").base } } };
    const p: Placement[] = [{ x: 1, y: 0, kind: "cannon" }];
    expect(canPlace(l, a, p, { x: 2, y: 0, kind: "cannon" })).toBe(false);
    expect(canPlace(l, a, p, { x: 2, y: 0, kind: "mortar" })).toBe(true);
    expect(canPlace(l, a, p, { x: 2, y: 0, kind: "laser" })).toBe(false);
  });
});
