import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { LAND, cellAt } from "../../src/sim/map.ts";
import { shoreField } from "../../src/render/terrain.ts";
import { mapLabels } from "../../src/render/labels.ts";

describe("map labels (#18)", () => {
  const levels = [0, 4, 9, 24].map((i) => ({ i, map: LEVELS[i]!().map }));

  it("names islands on land and waters on water, every name once", () => {
    for (const { i, map } of levels) {
      const labels = mapLabels(map, shoreField(map), i);
      expect(labels.some((l) => l.kind === "water")).toBe(true);
      for (const l of labels.filter((l) => l.kind !== "place")) {
        const land = cellAt(map, Math.floor(l.x), Math.floor(l.y)) === LAND;
        expect(land).toBe(l.kind === "island");
      }
      const texts = labels.map((l) => l.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  }, 60_000);

  it("keeps names of one kind apart", () => {
    for (const { i, map } of levels) {
      const labels = mapLabels(map, shoreField(map), i);
      for (const kind of ["island", "water"] as const) {
        const ls = labels.filter((l) => l.kind === kind);
        for (let a = 0; a < ls.length; a++) for (let b = a + 1; b < ls.length; b++) expect(Math.hypot(ls[a]!.x - ls[b]!.x, ls[a]!.y - ls[b]!.y)).toBeGreaterThanOrEqual(12);
      }
    }
  }, 60_000);

  it("gives a level the same names on every visit", () => {
    const map = LEVELS[9]!().map;
    expect(mapLabels(map, shoreField(map), 9)).toEqual(mapLabels(map, shoreField(map), 9));
  }, 60_000);
});
