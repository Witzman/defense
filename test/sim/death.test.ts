import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type Arsenal, type LevelDef } from "../../src/sim/world.ts";
import { turretType, type DeathFx, type TurretKind } from "../../src/content/turrets.ts";
import { TREE } from "../../src/content/tree.ts";
import { deriveArsenal } from "../../src/game/research.ts";
import { analyse } from "../../src/game/stats.ts";

// #43: death effects. A kill of a turret that learned one leaves it behind; the effect never chains.

function lake(): GameMap {
  const width = 30;
  const height = 9;
  const cells = new Uint8Array(width * height).fill(WATER);
  for (let x = 0; x < width; x++) cells[x] = LAND;
  return { width, height, cells, spawns: [{ x: 0, y: 4 }], goals: [{ x: width - 1, y: 4 }] };
}
const level: LevelDef = { map: lake(), enemies: { groups: [], speed: 1, hpScale: 1 }, goalEnergy: 1e6, cellCapacity: 50 };

function arsenal(kind: TurretKind, death: DeathFx[]): Arsenal {
  return { turrets: { [kind]: { capacity: 5, stats: { ...turretType(kind).base, shotsPerSecond: 0, turnRate: 1e6, range: 0.1 }, death } } };
}

/** A victim blob and a neighbour; the turret kills the victim. */
function setup(kind: TurretKind, death: DeathFx[]) {
  const w = createWorld(level, arsenal(kind, death), [{ x: 8, y: 0, kind }], 1);
  const victim = w.spawnBlob("green", 1, 10, 4);
  const near = w.spawnBlob("green", 50, 10.5, 4);
  const far = w.spawnBlob("green", 50, 20, 4);
  w.source = w.turrets[0]!;
  w.hit(victim, 1e9, "kinetic");
  const before = { near: near.hp, far: far.hp, danger: w.danger.reduce((a, b) => a + b, 0) };
  step(w);
  return { w, near, far, before };
}

describe("death effects (#43)", () => {
  it("explode hurts the neighbour of the dead blob, not a far one", () => {
    const { near, far, before } = setup("mortar", ["explode"]);
    expect(near.hp).toBeLessThan(before.near);
    expect(far.hp).toBe(before.far);
  });

  it("chill freezes the neighbour", () => {
    const { w, near, far } = setup("frost", ["chill"]);
    expect(near.frozenUntil).toBeGreaterThan(w.tick);
    expect(far.frozenUntil).toBe(0);
  });

  it("hazard adds danger where the blob died", () => {
    const plain = setup("napalm", []);
    const { w, before } = setup("napalm", ["hazard"]);
    expect(w.danger.reduce((a, b) => a + b, 0)).toBeGreaterThan(plain.w.danger.reduce((a, b) => a + b, 0));
    expect(before.danger).toBeGreaterThan(0);
  });

  it("without the effect nothing happens", () => {
    const { near, before } = setup("mortar", []);
    expect(near.hp).toBe(before.near);
  });

  it("an explosion does not chain into more explosions", () => {
    const w = createWorld(level, arsenal("mortar", ["explode"]), [{ x: 8, y: 0, kind: "mortar" }], 1);
    const victim = w.spawnBlob("green", 1, 10, 4);
    const weak = w.spawnBlob("green", 1, 10.5, 4);
    const behind = w.spawnBlob("green", 50, 11.5, 4);
    w.source = w.turrets[0]!;
    w.hit(victim, 1e9, "kinetic");
    const hp = behind.hp;
    step(w);
    expect(weak.size).toBeLessThanOrEqual(0);
    expect(behind.hp).toBe(hp);
  });

  it("is counted in the analysis", () => {
    const { w } = setup("mortar", ["explode"]);
    expect(analyse(w).effects).toContainEqual({ kind: "mortar", proc: "explode", count: 1 });
  });

  it("the tree teaches them at keystones and research turns them into the arsenal", () => {
    const node = TREE.find((n) => n.effects.some((e) => e.kind === "deathFx" && e.turret === "mortar"));
    expect(node).toBeDefined();
    const a = deriveArsenal([...TREE.filter((n) => n.effects.some((e) => e.kind === "unlock" && e.turret === "mortar")).map((n) => n.id), node!.id]);
    expect(a.turrets.mortar?.death).toEqual(["explode"]);
  });
});
