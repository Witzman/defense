import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { spawnChips, startLabel } from "../../src/ui/preview.ts";

describe("enemy preview at the spawns (#31)", () => {
  it.each(LEVELS.map((make, i) => ({ i: i + 1, make })))("level $i: each spawn's chips add up to its groups", ({ make }) => {
    const level = make();
    const chips = spawnChips(level);
    expect(chips.length).toBe(level.map.spawns.length);
    chips.forEach((row, s) => {
      const groups = level.enemies.groups.filter((g) => (g.spawn ?? 0) === s);
      expect(row.length).toBe(groups.length);
      expect(row.reduce((n, c) => n + c.count, 0)).toBe(groups.reduce((n, g) => n + g.count, 0));
      expect(row.length).toBeGreaterThan(0);
    });
  }, 60_000);

  it("shows a start only for groups that wait", () => {
    expect(startLabel(0)).toBe("");
    expect(startLabel(20)).toBe("ab 0:20");
    expect(startLabel(65)).toBe("ab 1:05");
  });
});
