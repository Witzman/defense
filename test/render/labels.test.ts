import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { LAND, cellAt } from "../../src/sim/map.ts";
import { shoreField } from "../../src/render/terrain.ts";
import { mapLabels, placeLabels, type Box, type LabelBox, type Placed } from "../../src/render/labels.ts";
import { createRng } from "../../src/sim/rng.ts";

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

describe("label placement (#38)", () => {
  const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const boxOf = (l: LabelBox, p: Placed): Box => ({ x0: p.x - l.w / 2, y0: p.y - l.h / 2, x1: p.x + l.w / 2, y1: p.y + l.h / 2 });
  const square = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

  it("keeps a label where it is when nothing is in the way", () => {
    const out: Placed[] = [];
    placeLabels([{ x: 100, y: 100, w: 60, h: 16 }], [square(300, 300, 10)], out);
    expect(out[0]).toEqual({ x: 100, y: 100, visible: true });
  });

  it("moves a label off a marker it sits on", () => {
    const out: Placed[] = [];
    const l = { x: 100, y: 100, w: 60, h: 16 };
    const marker = square(95, 102, 9);
    placeLabels([l], [marker], out);
    expect(out[0]!.visible).toBe(true);
    expect(overlap(boxOf(l, out[0]!), marker)).toBe(false);
  });

  it("hides a label that finds no free spot, and the earlier label wins", () => {
    const out: Placed[] = [];
    const ls = [
      { x: 100, y: 100, w: 60, h: 16 },
      { x: 100, y: 100, w: 60, h: 16 },
    ];
    placeLabels(ls, [], out);
    expect(out[0]).toEqual({ x: 100, y: 100, visible: true });
    expect(out[1]!.visible).toBe(true);
    placeLabels(ls, [square(100, 100, 200)], out);
    expect(out.map((p) => p.visible)).toEqual([false, false]);
  });

  it("never lets a shown label touch an obstacle or another shown label", () => {
    const rng = createRng(38);
    const out: Placed[] = [];
    for (let round = 0; round < 200; round++) {
      const labels: LabelBox[] = [];
      const obstacles: Box[] = [];
      for (let i = 0; i < 12; i++) labels.push({ x: rng.int(400), y: rng.int(300), w: 30 + rng.int(90), h: 14 + rng.int(6) });
      for (let i = 0; i < 20; i++) obstacles.push(square(rng.int(400), rng.int(300), 4 + rng.int(12)));
      placeLabels(labels, obstacles, out);
      const shown = labels.flatMap((l, i) => (out[i]!.visible ? [boxOf(l, out[i]!)] : []));
      expect(shown.length).toBeGreaterThan(0);
      for (const b of shown) for (const o of obstacles) expect(overlap(b, o)).toBe(false);
      for (let a = 0; a < shown.length; a++) for (let b = a + 1; b < shown.length; b++) expect(overlap(shown[a]!, shown[b]!)).toBe(false);
    }
  });

  it("uses only the first n labels and obstacles of longer pools", () => {
    const out: Placed[] = [];
    placeLabels([{ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }], [square(0, 0, 100)], out, 2, 1, 0);
    expect(out[0]).toEqual({ x: 0, y: 0, visible: true });
  });
});
