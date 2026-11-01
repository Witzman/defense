import { emptySave, parseSave, type Save } from "./save.ts";

/**
 * The save game lives in the browser (#24): localStorage, one slot, per browser and device. A file export and import
 * carry it between devices and guard against the browser clearing its data.
 */
export const SAVE_KEY = "flow-defense/save";

type Slot = Pick<Storage, "getItem" | "setItem">;

/** The browser's storage, or nothing where the browser refuses it (some private modes throw on access). */
function browserStorage(): Slot | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Loads the save game; a browser without one starts a new game. Throws on a stored save this build cannot read. */
export function loadSave(slot: Slot | undefined = browserStorage()): Save {
  if (!slot) throw new Error("Browser-Speicher nicht verfügbar");
  const text = slot.getItem(SAVE_KEY);
  if (text === null) return emptySave();
  return parseSave(JSON.parse(text));
}

/** Writes every save at once; `onState` tells the page whether it landed (a full or blocked storage throws). */
export function createSaver(onState: (state: "saved" | "failed") => void, slot: Slot | undefined = browserStorage()) {
  return {
    save(s: Save) {
      try {
        if (!slot) throw new Error("no storage");
        slot.setItem(SAVE_KEY, JSON.stringify(s));
        onState("saved");
      } catch {
        onState("failed");
      }
    },
  };
}

/** File name of an export, with the day: flow-defense-2026-11-01.json. */
export function exportName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `flow-defense-${d}.json`;
}

export function exportText(s: Save): string {
  return JSON.stringify(s, null, 2);
}

/** Reads an exported file; throws with a message for the player when it is not a save game. */
export function importText(text: string): Save {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist kein Spielstand (kein JSON).");
  }
  try {
    return parseSave(raw);
  } catch (err) {
    throw new Error(`Die Datei ist kein lesbarer Spielstand: ${(err as Error).message}`);
  }
}
