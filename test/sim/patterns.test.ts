import { describe, expect, it } from "vitest";
import { LAND, WATER, type GameMap } from "../../src/sim/map.ts";
import { createWorld, step, type Arsenal, type LevelDef } from "../../src/sim/world.ts";
import { TURRET_TYPES, turretType, type TurretKind } from "../../src/content/turrets.ts";

function lake(): GameMap {
  const width = 30;
  const height = 9;
  const cells = new Uint8Array(width * height).fill(WATER);
  for (let x = 0; x < width; x++) cells[x] = LAND;
  return { width, height, cells, spawns: [{ x: 0, y: 4 }], goals: [{ x: width - 1, y: 4 }] };
}
const level = (count: number, hpScale = 100): LevelDef => ({
  map: lake(),
  enemies: { groups: [{ type: "green", count, perSecond: 1000 }], speed: 2, hpScale },
  goalEnergy: 1000,
  cellCapacity: 50,
});
const armed = (kind: TurretKind, stats: Partial<ReturnType<typeof turretType>["base"]> = {}): Arsenal => ({
  turrets: { [kind]: { capacity: 5, stats: { ...turretType(kind).base, turnRate: 1e6, ...stats } } },
});

describe("pierce", () => {
  it("a railgun hits every blob on its line, not just the first", () => {
    const w = createWorld(level(1), armed("railgun", { range: 40 }), [], 1);
    step(w);
    const [a] = w.enemies;
    const b = w.spawnBlob("green", 1, a!.x + 3, a!.y);
    const off = w.spawnBlob("green", 1, a!.x + 3, a!.y + 3);
    w.place({ x: 0, y: 0, kind: "railgun" });
    // Aim along row 4 from the far left: put the turret on the line by moving the blobs onto its ray.
    const t = w.turrets[0]!;
    a!.x = t.x + 2; a!.y = t.y + 2;
    b.x = t.x + 4; b.y = t.y + 4;
    step(w);
    expect(a!.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
    expect(off.hp).toBe(100);
  });
});

describe("slow", () => {
  it("frost slows what it hits for a while", () => {
    const w = createWorld(level(1), armed("frost", { range: 40 }), [], 1);
    step(w);
    const e = w.enemies[0]!;
    const free = e.speed;
    w.place({ x: 5, y: 0, kind: "frost" });
    step(w);
    expect(e.speed).toBeLessThan(free);
    for (let i = 0; i < 30 * 10; i++) {
      w.turrets.length = 0;
      step(w);
    }
    expect(e.speed).toBeCloseTo(free);
  });
});

describe("turret kinds", () => {
  it("there are twelve, each with its own symbol and colour", () => {
    expect(TURRET_TYPES.length).toBe(12);
    expect(new Set(TURRET_TYPES.map((t) => t.symbol)).size).toBe(12);
    expect(new Set(TURRET_TYPES.map((t) => t.color)).size).toBe(12);
  });

  it.each(TURRET_TYPES.map((t) => t.id))("%s kills a weak stream in range", (kind) => {
    const w = createWorld(level(20, 1), armed(kind, { range: 40, shotsPerSecond: turretType(kind).base.shotsPerSecond * 5 }), [{ x: 15, y: 0, kind }], 1);
    for (let i = 0; i < 30 * 30 && w.status === "running"; i++) step(w);
    expect(w.killed).toBeGreaterThan(0);
  });
});
