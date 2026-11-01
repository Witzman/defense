import { describe, expect, it } from "vitest";
import { TURRET_MIN_RADIUS, turretReach, turretUnit } from "../../src/render/canvas.ts";

describe("turret size (#36)", () => {
  it("keeps a minimum radius in CSS pixels from afar", () => {
    for (const dpr of [1, 2]) {
      for (const s of [2, 5, 7 * dpr]) expect(turretUnit(s, dpr) * 0.45).toBeCloseTo(TURRET_MIN_RADIUS * dpr);
    }
  });

  it("does not change the close-up look", () => {
    for (const s of [24, 40, 64]) expect(turretUnit(s, 1)).toBe(s);
    expect(turretUnit(80, 2)).toBe(80);
  });

  it("reaches past its disc with glow and barrel", () => {
    expect(turretReach(5, 1)).toBeGreaterThan(TURRET_MIN_RADIUS);
  });
});
