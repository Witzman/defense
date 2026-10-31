import { describe, expect, it } from "vitest";
import { playCampaign } from "../../src/balance/campaign.ts";
import { PROFILES } from "../../src/balance/strategies.ts";
import { measureStep } from "../../src/balance/report.ts";

// The quick part of the balancing simulation (#9), as a guard in every test run. The full run is `npm run balance`.
describe("balancing guard", () => {
  it.each(PROFILES)("a %s player gets through level 1: no softlock at the start, whatever is researched first", (profile) => {
    const { results } = playCampaign({ profile, levels: [0], maxAttempts: 40 });
    expect(results[0]!.won).toBe(true);
  }, 120_000);

  it("the first level is not won by everyone on the first try", () => {
    const failures = PROFILES.map((profile) => playCampaign({ profile, levels: [0], maxAttempts: 40 }).results[0]!.failures);
    expect(failures.some((f) => f > 0)).toBe(true);
  }, 120_000);

  it("keeps a simulation step of the last level within budget (60 cannons, 40 s in)", () => {
    expect(measureStep(24).ms).toBeLessThan(25);
  }, 120_000);
});
