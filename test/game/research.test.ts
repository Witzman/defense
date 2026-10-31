import { describe, expect, it } from "vitest";
import { buy, canBuy, CATALOG, costOf, deriveArsenal, START_POINTS, type ResearchNode } from "../../src/game/research.ts";
import { turretType } from "../../src/content/turrets.ts";

const nodes: ResearchNode[] = [
  { id: "cannon", name: "Kanone", cost: 50, requires: [], effects: [{ kind: "unlock", turret: "cannon" }, { kind: "capacity", turret: "cannon", add: 2 }], group: { id: "unlock", growth: 4 } },
  { id: "mortar", name: "Mörser", cost: 50, requires: [], effects: [{ kind: "unlock", turret: "mortar" }, { kind: "capacity", turret: "mortar", add: 1 }], group: { id: "unlock", growth: 4 } },
  { id: "cap1", name: "+1", cost: 20, requires: ["cannon"], effects: [{ kind: "capacity", turret: "cannon", add: 1 }] },
  { id: "rate1", name: "Feuerrate", cost: 30, requires: ["cannon"], effects: [{ kind: "fireRate", turret: "cannon", mul: 1.5 }] },
  { id: "range1", name: "Reichweite", cost: 30, requires: ["cannon"], effects: [{ kind: "range", turret: "cannon", add: 1 }] },
  { id: "dmg1", name: "Schaden", cost: 30, requires: ["rate1", "range1"], effects: [{ kind: "damage", turret: "cannon", mul: 2 }] },
  { id: "ability", name: "Schuss", cost: 10, requires: [], effects: [{ kind: "abilityUnlock" }] },
  { id: "ability-cd", name: "CD", cost: 10, requires: ["ability"], effects: [{ kind: "abilityCooldown", mul: 0.5 }] },
];

describe("research", () => {
  it("starts with no turret and no ability", () => {
    expect(deriveArsenal([], nodes)).toEqual({ turrets: {} });
  });

  it("unlocking gives the turret kind and its first capacity", () => {
    expect(deriveArsenal(["cannon"], nodes).turrets.cannon?.capacity).toBe(2);
  });

  it("applies every bought effect to all turrets of its kind, and only that kind", () => {
    const a = deriveArsenal(["cannon", "mortar", "cap1", "rate1", "range1", "dmg1"], nodes);
    const base = turretType("cannon").base;
    expect(a.turrets.cannon).toEqual({ capacity: 3, stats: { ...base, shotsPerSecond: base.shotsPerSecond * 1.5, range: base.range + 1, damage: base.damage * 2 } });
    expect(a.turrets.mortar).toEqual({ capacity: 1, stats: turretType("mortar").base });
  });

  it("a second turret kind costs more than the first: specialising is cheap, branching out is grinding", () => {
    const mortar = nodes.find((n) => n.id === "mortar")!;
    expect(costOf(mortar, [], nodes)).toBe(50);
    expect(costOf(mortar, ["cannon"], nodes)).toBe(200);
  });

  it("can buy only what is affordable, not owned, and whose requirements are met", () => {
    expect(canBuy({ points: 49, research: [] }, "cannon", nodes)).toBe(false);
    expect(canBuy({ points: 50, research: [] }, "cannon", nodes)).toBe(true);
    expect(canBuy({ points: 500, research: ["cannon"] }, "cannon", nodes)).toBe(false);
    expect(canBuy({ points: 500, research: [] }, "cap1", nodes)).toBe(false);
    expect(canBuy({ points: 199, research: ["cannon"] }, "mortar", nodes)).toBe(false);
    expect(canBuy({ points: 500, research: ["cannon", "rate1"] }, "dmg1", nodes)).toBe(false);
    expect(canBuy({ points: 500, research: ["cannon", "rate1", "range1"] }, "dmg1", nodes)).toBe(true);
  });

  it("buying spends the current cost and records the node", () => {
    expect(buy({ points: 300, research: ["cannon"] }, "mortar", nodes)).toEqual({ points: 100, research: ["cannon", "mortar"] });
  });

  it("refuses to buy what canBuy refuses", () => {
    expect(() => buy({ points: 10, research: [] }, "cannon", nodes)).toThrow();
  });

  it("the mouse ability comes from research and improves with it", () => {
    expect(deriveArsenal(["ability"], nodes).ability).toBeDefined();
    expect(deriveArsenal(["ability", "ability-cd"], nodes).ability!.cooldown).toBe(deriveArsenal(["ability"], nodes).ability!.cooldown * 0.5);
  });

  it("ignores unknown ids in a save instead of failing", () => {
    expect(deriveArsenal(["cannon", "gone-in-v2"], nodes).turrets.cannon?.capacity).toBe(2);
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

    it("lets a new player unlock any one turret kind with the start budget", () => {
      for (const n of CATALOG.filter((n) => n.effects.some((e) => e.kind === "unlock"))) expect(costOf(n, [])).toBeLessThanOrEqual(START_POINTS);
    });
  });
});
