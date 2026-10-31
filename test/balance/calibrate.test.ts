import { afterEach, describe, expect, it } from "vitest";
import { fitFactor } from "../../src/balance/calibrate.ts";
import { BALANCE } from "../../src/content/balance.ts";
import { campaignLevel } from "../../src/content/levels.ts";

describe("per-level hit point factor", () => {
  afterEach(() => (BALANCE.levelHp.length = 0));

  it("scales a level's hit points and leaves the others alone", () => {
    const before = [campaignLevel(3).enemies.hpScale!, campaignLevel(4).enemies.hpScale!];
    BALANCE.levelHp[3] = 2.5;
    expect(campaignLevel(3).enemies.hpScale).toBeCloseTo(before[0]! * 2.5);
    expect(campaignLevel(4).enemies.hpScale).toBeCloseTo(before[1]!);
  });
});

describe("fitting the factor", () => {
  // Failures grow with the factor, like a level that gets harder.
  const failures = (m: number) => Math.round(4 * Math.log2(m) + 3);

  it("finds a factor that lands within the tolerance of the target", () => {
    const { factor, failures: f } = fitFactor((m) => ({ failures: failures(m), stuck: false }), { target: 10, tolerance: 2, start: 1 });
    expect(Math.abs(f - 10)).toBeLessThanOrEqual(2);
    expect(failures(factor)).toBe(f);
  });

  it("goes easier when the level is a wall", () => {
    const { factor } = fitFactor((m) => ({ failures: m > 0.3 ? 40 : 6, stuck: m > 0.3 }), { target: 10, tolerance: 3, start: 1 });
    expect(factor).toBeLessThanOrEqual(0.3);
  });

  it("never settles on a factor where a profile got stuck", () => {
    const { stuck } = fitFactor((m) => ({ failures: 9, stuck: m > 0.5 }), { target: 10, tolerance: 3, start: 1 });
    expect(stuck).toBe(false);
  });
});
