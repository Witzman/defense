import { describe, expect, it } from "vitest";
import { createSaver, exportName, exportText, importText, loadSave, SAVE_KEY } from "../../src/game/storage.ts";
import { emptySave } from "../../src/game/save.ts";

/** A stand-in for localStorage; `full` makes every write throw like a full or blocked storage. */
function fakeSlot(full = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

describe("loading", () => {
  it("starts a new game when the browser has none", () => {
    expect(loadSave(fakeSlot())).toEqual(emptySave());
  });

  it("returns what was saved", () => {
    const slot = fakeSlot();
    const s = { ...emptySave(), points: 42, research: ["cannon"], unlockedLevel: 3 };
    createSaver(() => {}, slot).save(s);
    expect(loadSave(slot)).toEqual(s);
  });

  it("fails loudly on a stored save it cannot read instead of pretending a new game", () => {
    const slot = fakeSlot();
    slot.data.set(SAVE_KEY, "{broken");
    expect(() => loadSave(slot)).toThrow();
    slot.data.set(SAVE_KEY, JSON.stringify({ version: 99, points: 1, research: [] }));
    expect(() => loadSave(slot)).toThrow();
  });

  it("fails loudly when the browser gives no storage", () => {
    expect(() => loadSave(undefined)).toThrow();
  });
});

describe("saver", () => {
  it("reports saved, and the last save wins", () => {
    const slot = fakeSlot();
    const states: string[] = [];
    const saver = createSaver((s) => states.push(s), slot);
    saver.save({ ...emptySave(), points: 1 });
    saver.save({ ...emptySave(), points: 2 });
    expect(loadSave(slot).points).toBe(2);
    expect(states).toEqual(["saved", "saved"]);
  });

  it("reports failed when the storage is full or blocked, without throwing", () => {
    const states: string[] = [];
    createSaver((s) => states.push(s), fakeSlot(true)).save(emptySave());
    createSaver((s) => states.push(s), undefined).save(emptySave());
    expect(states).toEqual(["failed", "failed"]);
  });
});

describe("export and import", () => {
  it("round-trips a save through the file text", () => {
    const s = { ...emptySave(), points: 7, research: ["cannon", "cannon-path-1"], unlockedLevel: 2, levels: { 0: { won: true, perfect: false, placements: [{ x: 3, y: 4, kind: "cannon" as const, facing: 90 }] } } };
    expect(importText(exportText(s))).toEqual(s);
  });

  it("refuses a file that is no save game, with a message for the player", () => {
    expect(() => importText("hello")).toThrow(/kein Spielstand/);
    expect(() => importText(JSON.stringify({ foo: 1 }))).toThrow(/kein lesbarer Spielstand/);
  });

  it("names the file after the day", () => {
    expect(exportName(new Date(2026, 10, 1))).toBe("flow-defense-2026-11-01.json");
  });
});
