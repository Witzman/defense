import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type Arsenal, type LevelDef } from "../../src/sim/world.ts";
import { turretType, type Combo, type ProcKind, type TurretKind } from "../../src/content/turrets.ts";
import { analyse } from "../../src/game/stats.ts";

// #43: hit effects and combinations are counted for the analysis; counting changes nothing in the run.

function lake(): GameMap {
  const width = 30;
  const height = 9;
  const cells = new Uint8Array(width * height).fill(WATER);
  for (let x = 0; x < width; x++) cells[x] = LAND;
  return { width, height, cells, spawns: [{ x: 0, y: 4 }], goals: [{ x: width - 1, y: 4 }] };
}
const level = (): LevelDef => ({ map: lake(), enemies: { groups: [{ type: "green", count: 1, perSecond: 100 }], speed: 1, hpScale: 1000 }, goalEnergy: 1e6, cellCapacity: 50 });

function arsenal(kind: TurretKind, procs: Partial<Record<ProcKind, { chance: number; power: number }>>, combos?: Combo[]): Arsenal {
  return { turrets: { [kind]: { capacity: 5, stats: { ...turretType(kind).base, turnRate: 1e6, range: 30 }, procs } }, ...(combos ? { combos } : {}) };
}

function run(a: Arsenal, kind: TurretKind, ticks: number) {
  const w = createWorld(level(), a, [{ x: 8, y: 0, kind }], 1);
  while (w.enemies.length === 0) step(w);
  for (let t = 0; t < ticks; t++) step(w);
  return w;
}

describe("effect statistics (#43)", () => {
  it("counts each triggered effect per turret kind", () => {
    const w = run(arsenal("cannon", { mark: { chance: 1, power: 0 } }), "cannon", 60);
    const a = analyse(w);
    const row = a.effects.find((e) => e.kind === "cannon" && e.proc === "mark");
    expect(row?.count).toBeGreaterThan(5);
  });

  it("no effects researched: nothing is listed", () => {
    const a = analyse(run(arsenal("cannon", {}), "cannon", 60));
    expect(a.effects).toEqual([]);
    expect(a.combos).toEqual([]);
  });

  it("a combination counts its hits and the damage it added", () => {
    const w = run(arsenal("cannon", { freeze: { chance: 1, power: 0 } }, ["shatter"]), "cannon", 90);
    const c = analyse(w).combos.find((x) => x.combo === "shatter");
    expect(c?.hits).toBeGreaterThan(0);
    expect(c!.damage).toBeGreaterThan(0);
    // The bonus is a third of what a ×1.5 hit deals, so it is less than all damage the cannon did.
    expect(c!.damage).toBeLessThan(w.turrets[0]!.damage);
  });

  it("a combination that is not researched does not count", () => {
    const w = run(arsenal("cannon", { freeze: { chance: 1, power: 0 } }), "cannon", 90);
    expect(analyse(w).combos).toEqual([]);
  });

  it("counting does not change the run", () => {
    const a = run(arsenal("cannon", { freeze: { chance: 0.4, power: 0 } }, ["shatter"]), "cannon", 120);
    const b = run(arsenal("cannon", { freeze: { chance: 0.4, power: 0 } }, ["shatter"]), "cannon", 120);
    expect(a.enemies[0]!.hp).toBe(b.enemies[0]!.hp);
    expect(a.stats.combos.shatter.damage).toBe(b.stats.combos.shatter.damage);
  });
});
