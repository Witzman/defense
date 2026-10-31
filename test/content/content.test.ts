import { describe, expect, it } from "vitest";
import { DAMAGE_TYPES, ENEMY_TYPES, vulnerability } from "../../src/content/enemies.ts";
import { TURRET_TYPES } from "../../src/content/turrets.ts";

describe("content", () => {
  it("every enemy can be hurt by at least two damage types that some turret deals", () => {
    const dealt = new Set(TURRET_TYPES.map((t) => t.damageType));
    for (const e of ENEMY_TYPES) {
      const hurting = DAMAGE_TYPES.filter((d) => dealt.has(d) && vulnerability(e, d) > 0);
      expect(hurting.length, e.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("enemy colours are unique, so colour alone tells the type", () => {
    expect(new Set(ENEMY_TYPES.map((e) => e.color)).size).toBe(ENEMY_TYPES.length);
  });

  it("turret symbols are unique", () => {
    expect(new Set(TURRET_TYPES.map((t) => t.symbol)).size).toBe(TURRET_TYPES.length);
  });
});
