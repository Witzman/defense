import { describe, expect, it } from "vitest";
import { MIN_ARC, nextArc, spreadArc, turnedFacing } from "../../src/ui/turretEdit.ts";

describe("turret editing (#25)", () => {
  it("turns by the finger angle in 15° steps and wraps", () => {
    expect(turnedFacing(0, Math.PI / 2)).toBe(90);
    expect(turnedFacing(90, (40 * Math.PI) / 180)).toBe(135);
    expect(turnedFacing(10, (-30 * Math.PI) / 180)).toBe(345);
    expect(turnedFacing(350, (10 * Math.PI) / 180)).toBe(0);
  });

  it("widens and narrows the arc with the spread, in 15° steps, between 30° and 360°", () => {
    expect(spreadArc(120, 1.5)).toBe(180);
    expect(spreadArc(120, 0.5)).toBe(60);
    expect(spreadArc(90, 0.1)).toBe(MIN_ARC);
    expect(spreadArc(180, 3)).toBe(360);
    expect(spreadArc(100, 1)).toBe(105);
  });

  it("the arc button steps to the next narrower stop, also from an arc set by fingers", () => {
    expect(nextArc(360)).toBe(180);
    expect(nextArc(60)).toBe(360);
    expect(nextArc(105)).toBe(90);
    expect(nextArc(30)).toBe(360);
  });
});
