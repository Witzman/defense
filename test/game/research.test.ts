import { describe, expect, it } from "vitest";
import { BASE_TURRET, buy, canBuy, CATALOG, deriveLoadout, type ResearchNode } from "../../src/game/research.ts";

const nodes: ResearchNode[] = [
  { id: "cannon", name: "Kanone", cost: 50, requires: [], effects: [{ kind: "unlock" }, { kind: "capacity", add: 2 }] },
  { id: "cap1", name: "+1", cost: 20, requires: ["cannon"], effects: [{ kind: "capacity", add: 1 }] },
  { id: "rate1", name: "Feuerrate", cost: 30, requires: ["cannon"], effects: [{ kind: "fireRate", mul: 1.5 }] },
  { id: "range1", name: "Reichweite", cost: 30, requires: ["cannon"], effects: [{ kind: "range", add: 1 }] },
  { id: "dmg1", name: "Schaden", cost: 30, requires: ["rate1", "range1"], effects: [{ kind: "damage", mul: 2 }] },
];

describe("research", () => {
  it("starts with no turret at all", () => {
    expect(deriveLoadout([], nodes)).toEqual({ unlocked: false, capacity: 0, turret: BASE_TURRET });
  });

  it("unlocking gives the turret and its first capacity", () => {
    const l = deriveLoadout(["cannon"], nodes);
    expect(l.unlocked).toBe(true);
    expect(l.capacity).toBe(2);
  });

  it("applies every bought effect to the one turret type", () => {
    const l = deriveLoadout(["cannon", "cap1", "rate1", "range1", "dmg1"], nodes);
    expect(l.capacity).toBe(3);
    expect(l.turret.shotsPerSecond).toBeCloseTo(BASE_TURRET.shotsPerSecond * 1.5);
    expect(l.turret.range).toBe(BASE_TURRET.range + 1);
    expect(l.turret.damage).toBe(BASE_TURRET.damage * 2);
  });

  it("can buy only what is affordable, not owned, and whose requirements are met", () => {
    expect(canBuy({ points: 49, research: [] }, "cannon", nodes)).toBe(false);
    expect(canBuy({ points: 50, research: [] }, "cannon", nodes)).toBe(true);
    expect(canBuy({ points: 500, research: ["cannon"] }, "cannon", nodes)).toBe(false);
    expect(canBuy({ points: 500, research: [] }, "cap1", nodes)).toBe(false);
    expect(canBuy({ points: 500, research: ["cannon", "rate1"] }, "dmg1", nodes)).toBe(false);
    expect(canBuy({ points: 500, research: ["cannon", "rate1", "range1"] }, "dmg1", nodes)).toBe(true);
  });

  it("buying spends the cost and records the node", () => {
    expect(buy({ points: 70, research: [] }, "cannon", nodes)).toEqual({ points: 20, research: ["cannon"] });
  });

  it("refuses to buy what canBuy refuses", () => {
    expect(() => buy({ points: 10, research: [] }, "cannon", nodes)).toThrow();
  });

  it("ignores unknown ids in a save instead of failing", () => {
    expect(deriveLoadout(["cannon", "gone-in-v2"], nodes).capacity).toBe(2);
  });

  describe("the shipped catalog", () => {
    it("has unique ids and only known requirements, without cycles", () => {
      const ids = new Set(CATALOG.map((n) => n.id));
      expect(ids.size).toBe(CATALOG.length);
      for (const n of CATALOG) for (const r of n.requires) expect(ids.has(r)).toBe(true);
      const done = new Set<string>();
      let progress = true;
      while (progress) {
        progress = false;
        for (const n of CATALOG) if (!done.has(n.id) && n.requires.every((r) => done.has(r))) (done.add(n.id), (progress = true));
      }
      expect(done.size).toBe(CATALOG.length);
    });

    it("lets a new player unlock a turret with the start budget", async () => {
      const { START_POINTS } = await import("../../src/game/research.ts");
      expect(CATALOG.some((n) => n.requires.length === 0 && n.effects.some((e) => e.kind === "unlock") && n.cost <= START_POINTS)).toBe(true);
    });
  });
});
