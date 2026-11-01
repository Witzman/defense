import { describe, expect, it } from "vitest";
import { slotCount } from "../../src/ui/controls.ts";

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
