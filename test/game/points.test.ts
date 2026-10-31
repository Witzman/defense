import { describe, expect, it } from "vitest";
import { runPoints } from "../../src/game/points.ts";

describe("research points for a run", () => {
  it("are zero when nothing was killed", () => {
    expect(runPoints(0, 0, 70)).toBe(0);
  });

  it("grow with every kill", () => {
    for (let k = 1; k <= 70; k++) expect(runPoints(0, k, 70)).toBeGreaterThan(runPoints(0, k - 1, 70));
  });

  it("reward the share: half of a small level beats a third of the same kills spread over a bigger one", () => {
    expect(runPoints(0, 35, 70)).toBeGreaterThan(runPoints(0, 35, 105));
  });

  it("pay more per kill on a later level, so the current level is the best farm", () => {
    expect(runPoints(1, 50, 100)).toBeGreaterThan(runPoints(0, 50, 100));
    expect(runPoints(2, 50, 100)).toBeGreaterThan(runPoints(1, 50, 100));
  });

  it("are whole numbers", () => {
    expect(Number.isInteger(runPoints(1, 17, 333))).toBe(true);
  });
});
