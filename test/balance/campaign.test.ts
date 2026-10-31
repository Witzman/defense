import { describe, expect, it } from "vitest";
import { shouldFarm } from "../../src/balance/campaign.ts";

describe("farming decision of the bot player", () => {
  const stuck = { levelIndex: 3, failures: 5, bestShare: 0.1, farmPays: 100, tryPays: 10, farmStreak: 0 };

  it("farms the previous level when stuck far below the bar and farming pays more", () => {
    expect(shouldFarm(stuck)).toBe(true);
  });

  it("comes back to the level after a few farming runs, so the new research gets tried", () => {
    expect(shouldFarm({ ...stuck, farmStreak: 3 })).toBe(false);
  });

  it("never farms on the first level or before three honest tries", () => {
    expect(shouldFarm({ ...stuck, levelIndex: 0 })).toBe(false);
    expect(shouldFarm({ ...stuck, failures: 2 })).toBe(false);
  });

  it("does not farm when the level itself pays as well", () => {
    expect(shouldFarm({ ...stuck, farmPays: 12 })).toBe(false);
  });
});
