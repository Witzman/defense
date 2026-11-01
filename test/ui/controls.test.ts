import { describe, expect, it } from "vitest";
import { cooldownFraction, slotCount } from "../../src/ui/controls.ts";

describe("turret slot count (#35)", () => {
  it("shows only the free number while plenty is left", () => {
    expect(slotCount(1, 95)).toBe("94");
    expect(slotCount(0, 10)).toBe("10");
  });

  it("shows free/total once nine or fewer are left", () => {
    expect(slotCount(1, 10)).toBe("9/10");
    expect(slotCount(2, 4)).toBe("2/4");
    expect(slotCount(4, 4)).toBe("0/4");
    expect(slotCount(6, 4)).toBe("0/4");
  });
});

describe("precision shot ring (#37)", () => {
  const dt = 1 / 30;
  it("is full when ready, also before the first shot", () => {
    expect(cooldownFraction(0, 0, 8, dt)).toBe(1);
    expect(cooldownFraction(500, 480, 8, dt)).toBe(1);
  });

  it("starts empty when fired and fills evenly over the cooldown", () => {
    // Fired at tick 100 with 8 s cooldown: ready at 100 + 240.
    expect(cooldownFraction(100, 340, 8, dt)).toBe(0);
    expect(cooldownFraction(160, 340, 8, dt)).toBeCloseTo(0.25);
    expect(cooldownFraction(220, 340, 8, dt)).toBeCloseTo(0.5);
    expect(cooldownFraction(339, 340, 8, dt)).toBeCloseTo(239 / 240);
  });

  it("stays within 0 … 1 for odd input", () => {
    expect(cooldownFraction(0, 1000, 8, dt)).toBe(0);
    expect(cooldownFraction(0, 10, 0, dt)).toBe(1);
  });
});
