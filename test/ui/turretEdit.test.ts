import { describe, expect, it } from "vitest";
import { facingToWater, turnedFacing } from "../../src/ui/turretEdit.ts";

describe("turret editing (#25)", () => {
  it("turns by the finger angle in 15° steps and wraps", () => {
    expect(turnedFacing(0, Math.PI / 2)).toBe(90);
    expect(turnedFacing(90, (40 * Math.PI) / 180)).toBe(135);
    expect(turnedFacing(10, (-30 * Math.PI) / 180)).toBe(345);
    expect(turnedFacing(350, (10 * Math.PI) / 180)).toBe(0);
  });
});

describe("facing towards the water (#41)", () => {
  // Row 0..4, water in the east columns 5..9 only.
  const w = 10;
  const h = 5;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 5; x < w; x++) cells[y * w + x] = 1;
  it("looks at the water", () => {
    expect(facingToWater(cells, w, h, 3, 2, 1)).toBe(0);
    const west = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < 2; x++) west[y * w + x] = 1;
    expect(facingToWater(west, w, h, 4, 2, 1)).toBe(180);
  });
  it("keeps 0 with no water near", () => {
    expect(facingToWater(new Uint8Array(w * h), w, h, 3, 2, 1)).toBe(0);
  });
});
