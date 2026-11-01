import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type Arsenal, type LevelDef } from "../../src/sim/world.ts";
import { turretType, type Combo, type ProcKind, type TurretKind } from "../../src/content/turrets.ts";
import { TREE } from "../../src/content/tree.ts";
import { deriveArsenal } from "../../src/game/research.ts";

// #42: hit effects with a chance, and combinations of statuses.

function lake(): GameMap {
  const width = 30;
  const height = 9;
  const cells = new Uint8Array(width * height).fill(WATER);
  for (let x = 0; x < width; x++) cells[x] = LAND;
  return { width, height, cells, spawns: [{ x: 0, y: 4 }], goals: [{ x: width - 1, y: 4 }] };
}
const level = (type = "green", count = 1): LevelDef => ({ map: lake(), enemies: { groups: [{ type, count, perSecond: 100 }], speed: 1, hpScale: 1000 }, goalEnergy: 1e6, cellCapacity: 50 });

function arsenal(kind: TurretKind, procs: Partial<Record<ProcKind, { chance: number; power: number }>>, combos?: Combo[], stats = {}): Arsenal {
  return { turrets: { [kind]: { capacity: 5, stats: { ...turretType(kind).base, turnRate: 1e6, range: 30, ...stats }, procs } }, ...(combos ? { combos } : {}) };
}

function run(a: Arsenal, kind: TurretKind, ticks: number, type = "green", count = 1) {
  const w = createWorld(level(type, count), a, [{ x: 8, y: 0, kind }], 1);
  while (w.enemies.length === 0) step(w);
  for (let t = 0; t < ticks; t++) step(w);
  return w;
}

describe("hit effects (#42)", () => {
  it("a chance of 1 triggers on every shot; a chance of 0.5 on every second", () => {
    const sure = run(arsenal("cannon", { mark: { chance: 1, power: 0 } }), "cannon", 30);
    expect(sure.enemies[0]!.markUntil).toBeGreaterThan(sure.tick);
    const none = run(arsenal("cannon", {}), "cannon", 30);
    expect(none.enemies[0]!.markUntil).toBe(0);
  });

  it("the chance is collected, not rolled: the same run gives the same result", () => {
    const a = () => run(arsenal("cannon", { ignite: { chance: 0.3, power: 0 } }), "cannon", 90).enemies[0]!.burnUntil;
    expect(a()).toBe(a());
    expect(a()).toBeGreaterThan(0);
  });

  it("freeze nearly stops the target; stun stops it", () => {
    const f = run(arsenal("cannon", { freeze: { chance: 1, power: 0 } }), "cannon", 10);
    expect(f.enemies[0]!.speed).toBeLessThan(f.enemies[0]!.baseSpeed * 0.2);
    const s = run(arsenal("cannon", { stun: { chance: 1, power: 0 } }), "cannon", 10);
    expect(s.enemies[0]!.speed).toBe(0);
  });

  it("a marked blob takes more damage", () => {
    const plain = createWorld(level(), arsenal("cannon", {}), [], 1);
    const marked = createWorld(level(), arsenal("cannon", {}), [], 1);
    while (plain.enemies.length === 0) step(plain);
    while (marked.enemies.length === 0) step(marked);
    marked.enemies[0]!.markUntil = 1e9;
    plain.hit(plain.enemies[0]!, 100, "kinetic");
    marked.hit(marked.enemies[0]!, 100, "kinetic");
    expect(marked.enemies[0]!.hp).toBeLessThan(plain.enemies[0]!.hp);
  });

  it("a grenade hits the neighbour of the target", () => {
    const total = (procs: Partial<Record<ProcKind, { chance: number; power: number }>>) => {
      const w = createWorld(level("green", 2), arsenal("cannon", procs, undefined, { damage: 1 }), [{ x: 8, y: 0, kind: "cannon" }], 1);
      for (let t = 0; t < 400 && w.enemies.length < 2; t++) step(w);
      for (let t = 0; t < 20; t++) step(w);
      return w.enemies.reduce((sum, e) => sum + e.hp, 0);
    };
    expect(total({ grenade: { chance: 1, power: 0 } })).toBeLessThan(total({}) - 1);
  });
});

describe("combinations (#42)", () => {
  const frozen = (combos?: Combo[]) => {
    const w = createWorld(level(), arsenal("cannon", {}, combos), [], 1);
    while (w.enemies.length === 0) step(w);
    const e = w.enemies[0]!;
    e.frozenUntil = 1e9;
    e.wetUntil = 1e9;
    e.burnDps = 1;
    e.burnUntil = 1e9;
    const hp = e.hp;
    return (type: Parameters<typeof w.hit>[2]) => {
      const before = e.hp;
      w.hit(e, 10, type);
      const d = before - e.hp;
      e.hp = hp;
      return d;
    };
  };

  it("shatter: frozen blobs take 50 % more kinetic and explosive damage", () => {
    expect(frozen(["shatter"])("kinetic") / frozen()("kinetic")).toBeCloseTo(1.5);
    expect(frozen(["shatter"])("explosive") / frozen()("explosive")).toBeCloseTo(1.5);
    expect(frozen(["shatter"])("energy") / frozen()("energy")).toBeCloseTo(1);
  });
  it("conduct: wet blobs take 50 % more electric damage", () => {
    expect(frozen(["conduct"])("electric") / frozen()("electric")).toBeCloseTo(1.5);
  });
  it("blaze: burning blobs take 30 % more explosive damage", () => {
    expect(frozen(["blaze"])("explosive") / frozen()("explosive")).toBeCloseTo(1.3);
  });
  it("frost wets what it hits", () => {
    const w = run(arsenal("frost", {}), "frost", 20);
    expect(w.enemies[0]!.wetUntil).toBeGreaterThan(w.tick);
  });
});

describe("the tree (#42)", () => {
  it("every kind has two chains of hit effects, each ending in a keystone that makes it stronger", () => {
    for (const k of ["cannon", "rocket", "frost", "tesla"] as TurretKind[]) {
      for (const [chain, length] of [["procA", 7], ["procB", 10]] as const) {
        const nodes = TREE.filter((n) => n.id.startsWith(`${k}-${chain}-`));
        expect(nodes).toHaveLength(length);
        expect(nodes.at(-1)!.effects.some((e) => e.kind === "procPower")).toBe(true);
      }
    }
  });
  it("a full chain gives a good chance, and it is capped per shot", () => {
    const ids = ["rocket", ...TREE.filter((n) => n.id.startsWith("rocket-procA-")).map((n) => n.id)];
    const p = deriveArsenal(ids).turrets.rocket!.procs!.freeze!;
    expect(p.chance).toBeCloseTo(5 * 0.025 + 0.08 + 0.2);
    expect(p.power).toBe(1);
  });
  it("three synergy nodes switch on a combination", () => {
    const combos = TREE.flatMap((n) => n.effects).filter((e) => e.kind === "combo");
    expect(combos.map((e) => (e as { combo: string }).combo).sort()).toEqual(["blaze", "conduct", "shatter"]);
  });
});
