import { describe, expect, it } from "vitest";
import { emptySave, parseSave, recordRun, SAVE_VERSION, setPlacements } from "../../src/game/save.ts";
import { START_POINTS } from "../../src/game/research.ts";

describe("save game", () => {
  it("a new game has the start points, no research, level 1 open", () => {
    const s = emptySave();
    expect(s).toMatchObject({ version: SAVE_VERSION, points: START_POINTS, research: [], unlockedLevel: 0 });
  });

  it("survives a round trip through JSON", () => {
    const s = setPlacements(emptySave(), 0, [{ x: 1, y: 2, kind: "mortar", facing: 45, arc: 180 }]);
    expect(parseSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("rejects what is not a save", () => {
    for (const bad of [null, 3, [], { version: 2 }, { version: 99, points: 1 }, { version: 2, points: "x", research: [] }])
      expect(() => parseSave(bad)).toThrow();
  });

  it("a version 1 save keeps the research the tree still has and refunds the rest", async () => {
    const { LEGACY_REFUND } = await import("../../src/game/save.ts");
    const s = parseSave({ version: 1, points: 5, research: ["cannon", "cannon-old-node", "mortar-gone"] });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.research).toEqual(["cannon"]);
    expect(s.points).toBe(5 + 2 * LEGACY_REFUND);
  });

  it("fills fields a save from an older build lacks", () => {
    expect(parseSave({ version: 2, points: 5, research: ["cannon"] })).toMatchObject({ points: 5, research: ["cannon"], unlockedLevel: 0, levels: {} });
  });

  it("reads placements of builds before turret kinds as cannons facing east, full circle", () => {
    const s = parseSave({ version: 2, points: 5, research: [], levels: { "0": { won: false, perfect: false, placements: [{ x: 1, y: 2 }] } } });
    expect(s.levels[0]!.placements).toEqual([{ x: 1, y: 2, kind: "cannon", facing: 0, arc: 360 }]);
  });

  it("keeps kind, facing and arc of a placement", () => {
    const p = { x: 1, y: 2, kind: "laser", facing: 90, arc: 120 };
    const s = parseSave({ version: 2, points: 5, research: [], levels: { "0": { won: false, perfect: false, placements: [p, { x: 3, y: 3, kind: "nonsense" }] } } });
    expect(s.levels[0]!.placements).toEqual([p]);
  });

  it("drops malformed placements instead of failing the whole save", () => {
    const s = parseSave({ version: 2, points: 5, research: [], unlockedLevel: 0, levels: { "0": { won: false, perfect: false, placements: [{ x: 1, y: 2 }, { x: "a" }] } } });
    expect(s.levels[0]!.placements).toEqual([{ x: 1, y: 2, kind: "cannon", facing: 0, arc: 360 }]);
  });
});

describe("recording a run", () => {
  it("a defeat keeps the points it earned and opens nothing", () => {
    const s = recordRun(emptySave(), 0, { status: "lost", killed: 20, total: 70, perfect: false });
    expect(s.points).toBeGreaterThan(START_POINTS);
    expect(s.unlockedLevel).toBe(0);
    expect(s.levels[0]?.won ?? false).toBe(false);
  });

  it("a victory opens the next level and is remembered", () => {
    const s = recordRun(emptySave(), 0, { status: "won", killed: 60, total: 70, perfect: false });
    expect(s.unlockedLevel).toBe(1);
    expect(s.levels[0]!.won).toBe(true);
    expect(s.levels[0]!.perfect).toBe(false);
  });

  it("a perfect clear stays perfect after a later, worse win", () => {
    let s = recordRun(emptySave(), 0, { status: "won", killed: 70, total: 70, perfect: true });
    s = recordRun(s, 0, { status: "won", killed: 50, total: 70, perfect: false });
    expect(s.levels[0]!.perfect).toBe(true);
  });

  it("replaying an old level never closes a newer one", () => {
    let s = recordRun(emptySave(), 0, { status: "won", killed: 70, total: 70, perfect: true });
    s = recordRun(s, 1, { status: "won", killed: 70, total: 70, perfect: true });
    s = recordRun(s, 0, { status: "won", killed: 70, total: 70, perfect: true });
    expect(s.unlockedLevel).toBe(2);
  });

  it("does not open beyond the last level", () => {
    const s = recordRun({ ...emptySave(), unlockedLevel: 2 }, 2, { status: "won", killed: 1, total: 1, perfect: true }, 3);
    expect(s.unlockedLevel).toBe(2);
  });
});
