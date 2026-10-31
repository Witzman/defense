import { describe, expect, it } from "vitest";
import { buy, canBuy, CATALOG, costOf, deriveArsenal, START_POINTS, type ResearchNode } from "../../src/game/research.ts";
import { ROOT } from "../../src/content/tree.ts";
import { turretType } from "../../src/content/turrets.ts";
import { BALANCE } from "../../src/content/balance.ts";

/** Every node gets dearer with overall progress: this factor per node owned. */
const g = BALANCE.costProgressGrowth;

const n = (id: string, cost: number, links: string[], effects: ResearchNode["effects"], extra: Partial<ResearchNode> = {}): ResearchNode => ({
  id, name: id, cost, links, effects, size: "small", cluster: "t", x: 0, y: 0, ...extra,
});
const nodes: ResearchNode[] = [
  n(ROOT, 0, ["cannon", "mortar", "ability"], [], { size: "start" }),
  n("cannon", 50, [ROOT, "cap1", "rate1"], [{ kind: "unlock", turret: "cannon" }, { kind: "capacity", turret: "cannon", add: 2 }], { group: { id: "unlock", growth: 4 } }),
  n("mortar", 50, [ROOT, "radius1"], [{ kind: "unlock", turret: "mortar" }, { kind: "capacity", turret: "mortar", add: 1 }], { group: { id: "unlock", growth: 4 } }),
  n("cap1", 20, ["cannon", "capx2"], [{ kind: "capacity", turret: "cannon", add: 1 }]),
  n("capx2", 20, ["cap1"], [{ kind: "capacityMul", turret: "cannon", mul: 2 }]),
  n("rate1", 30, ["cannon", "syn"], [{ kind: "fireRate", turret: "cannon", mul: 1.5 }]),
  n("radius1", 30, ["mortar"], [{ kind: "pattern", turret: "mortar", field: "radius", add: 0.5 }]),
  n("syn", 10, ["rate1"], [{ kind: "damage", turret: "cannon", mul: 2 }], { requiresAll: ["mortar"] }),
  n("ability", 10, [ROOT, "cd"], [{ kind: "abilityUnlock" }]),
  n("cd", 10, ["ability"], [{ kind: "abilityCooldown", mul: 0.5 }]),
];
const rich = (research: string[]) => ({ points: 10_000, research });

describe("research on the tree", () => {
  it("starts with no turret and no ability", () => {
    expect(deriveArsenal([], nodes)).toEqual({ turrets: {} });
  });

  it("a node is buyable when it touches an owned node; the start counts as owned", () => {
    expect(canBuy(rich([]), "cannon", nodes)).toBe(true);
    expect(canBuy(rich([]), "cap1", nodes)).toBe(false);
    expect(canBuy(rich(["cannon"]), "cap1", nodes)).toBe(true);
  });

  it("a synergy also needs everything in requiresAll", () => {
    expect(canBuy(rich(["cannon", "rate1"]), "syn", nodes)).toBe(false);
    expect(canBuy(rich(["cannon", "rate1", "mortar"]), "syn", nodes)).toBe(true);
  });

  it("without any turret, only turret unlocks can be bought: points spent elsewhere could never come back", () => {
    expect(canBuy(rich([]), "ability", nodes)).toBe(false);
    expect(canBuy(rich(["cannon"]), "ability", nodes)).toBe(true);
  });

  it("the start itself cannot be bought, owned nodes not twice", () => {
    expect(canBuy(rich([]), ROOT, nodes)).toBe(false);
    expect(canBuy(rich(["cannon"]), "cannon", nodes)).toBe(false);
  });

  it("a second turret kind costs four times the first (and a little more for progress)", () => {
    const mortar = nodes.find((x) => x.id === "mortar")!;
    expect(costOf(mortar, [], nodes)).toBe(50);
    expect(costOf(mortar, ["cannon"], nodes)).toBe(Math.round(200 * g));
  });

  it("capacity adds first, then multiplies", () => {
    expect(deriveArsenal(["cannon", "cap1", "capx2"], nodes).turrets.cannon!.capacity).toBe(6);
  });

  it("stat effects apply to all turrets of the kind", () => {
    const base = turretType("cannon").base;
    expect(deriveArsenal(["cannon", "rate1"], nodes).turrets.cannon!.stats.shotsPerSecond).toBeCloseTo(base.shotsPerSecond * 1.5);
  });

  it("bonuses of the same stat add up instead of multiplying (#19)", () => {
    const base = turretType("cannon").base;
    const tree = [
      ...nodes,
      n("rate2", 30, ["rate1"], [{ kind: "fireRate", turret: "cannon", mul: 1.5 }]),
      n("dmg1", 10, ["cannon"], [{ kind: "damage", turret: "cannon", mul: 1.2 }]),
      n("dmg2", 10, ["cannon"], [{ kind: "damage", turret: "cannon", mul: 1.2 }]),
      n("cap2x", 20, ["cap1"], [{ kind: "capacityMul", turret: "cannon", mul: 2 }]),
    ];
    const a = deriveArsenal(["cannon", "rate1", "rate2", "dmg1", "dmg2", "cap1", "capx2", "cap2x"], tree).turrets.cannon!;
    expect(a.stats.shotsPerSecond).toBeCloseTo(base.shotsPerSecond * 2); // 1 + 0.5 + 0.5, not 2.25
    expect(a.stats.damage).toBeCloseTo(base.damage * 1.4); // not 1.44
    expect(a.capacity).toBe(9); // 3 × (1 + 1 + 1), not 3 × 4
  });

  it("cooldown reductions add up and stop at a floor", () => {
    const tree = [...nodes, n("cd2", 10, ["cd"], [{ kind: "abilityCooldown", mul: 0.5 }]), n("cd3", 10, ["cd"], [{ kind: "abilityCooldown", mul: 0.5 }])];
    const one = deriveArsenal(["ability", "cd"], tree).ability!.cooldown;
    const three = deriveArsenal(["ability", "cd", "cd2", "cd3"], tree).ability!.cooldown;
    const base = deriveArsenal(["ability"], tree).ability!.cooldown;
    expect(one).toBeCloseTo(base * 0.5);
    expect(three).toBeCloseTo(base * 0.25); // 1 − 1.5 would be negative: the floor holds
  });

  it("pattern effects change the weapon's pattern", () => {
    const p = deriveArsenal(["mortar", "radius1"], nodes).turrets.mortar!.pattern;
    expect(p).toEqual({ ...turretType("mortar").pattern, radius: (turretType("mortar").pattern as { radius: number }).radius + 0.5 });
  });

  it("buying spends the current cost", () => {
    expect(buy({ points: 300, research: ["cannon"] }, "mortar", nodes)).toEqual({ points: 300 - Math.round(200 * g), research: ["cannon", "mortar"] });
    expect(() => buy({ points: 10, research: [] }, "cannon", nodes)).toThrow();
  });

  it("the ability comes from research and improves with it", () => {
    // (bought after a turret, see the rule above)
    expect(deriveArsenal(["ability", "cd"], nodes).ability!.cooldown).toBe(deriveArsenal(["ability"], nodes).ability!.cooldown * 0.5);
  });

  it("ignores unknown ids in a save", () => {
    expect(deriveArsenal(["cannon", "gone"], nodes).turrets.cannon!.capacity).toBe(2);
  });

  it("the shipped tree lets a new player unlock any one turret kind with the start budget", () => {
    for (const x of CATALOG.filter((x) => x.effects.some((e) => e.kind === "unlock"))) {
      expect(costOf(x, [])).toBeLessThanOrEqual(START_POINTS);
      expect(canBuy({ points: START_POINTS, research: [] }, x.id)).toBe(true);
    }
  });
});
