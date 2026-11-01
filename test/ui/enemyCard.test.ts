import { describe, expect, it } from "vitest";
import { ENEMY_TYPES, enemyType } from "../../src/content/enemies.ts";
import { TURRET_TYPES } from "../../src/content/turrets.ts";
import { enemyFacts, verdict } from "../../src/ui/enemyCard.ts";

const ALL = TURRET_TYPES.map((t) => t.id);

describe("enemy card (#31, #32)", () => {
  it("a Grünling resists nothing: every turret works well", () => {
    expect(enemyFacts(enemyType("green"), ALL).verdicts.every((v) => v.rating === "good")).toBe(true);
  });

  it("the laser cannot touch the Fels, explosives work badly, kinetic only fairly", () => {
    const rock = enemyType("rock");
    expect(verdict(rock, "laser")).toMatchObject({ rating: "bad", share: 0 });
    expect(verdict(rock, "mortar").rating).toBe("bad");
    expect(verdict(rock, "cannon").rating).toBe("fair");
    expect(enemyFacts(rock, ALL).immune).toContain("Sofort-Kill (Laser)");
    expect(enemyFacts(rock, ALL).depth).toBe("bleibt tief");
  });

  it("fire does nothing to Glut; it is listed as an immunity, not a resistance", () => {
    const ember = enemyType("ember");
    expect(verdict(ember, "flamer")).toMatchObject({ rating: "bad", share: 0 });
    const f = enemyFacts(ember, ALL);
    expect(f.immune).toContain("Feuerschaden");
    expect(f.resist.map((r) => r.type)).not.toContain("fire");
  });

  it("electric turrets break shields; the Panzer shrugs off kinetic", () => {
    expect(verdict(enemyType("shield"), "breaker").rating).toBe("good");
    expect(verdict(enemyType("armor"), "gatling").rating).toBe("bad");
  });

  it("speed and route in words, only for the unlocked turrets", () => {
    expect(enemyFacts(enemyType("swarm"), ["cannon"]).speed).toBe("schnell");
    expect(enemyFacts(enemyType("swarm"), ["cannon"]).depth).toBe("nimmt Abkürzungen am Ufer");
    expect(enemyFacts(enemyType("rock"), []).speed).toBe("langsam");
    for (const t of ENEMY_TYPES) expect(enemyFacts(t, ["cannon", "tesla"]).verdicts.map((v) => v.kind)).toEqual(["cannon", "tesla"]);
  });
});
