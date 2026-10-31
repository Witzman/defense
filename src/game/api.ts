import { emptySave, parseSave, type Save } from "./save.ts";

/** Loads the save game; a server without one starts a new game. */
export async function loadSave(): Promise<Save> {
  const res = await fetch("api/save", { cache: "no-store" });
  if (res.status === 404) return emptySave();
  if (!res.ok) throw new Error(`Laden fehlgeschlagen (${res.status})`);
  return parseSave(await res.json());
}

/**
 * Writes saves in order, newest wins. A failed write is retried until it lands, so research points from a lost
 * run are not lost to a hiccup; `onState` tells the page whether everything is stored.
 */
export function createSaver(onState: (state: "saved" | "saving" | "failed") => void) {
  let pending: Save | undefined;
  let busy = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  async function flush() {
    if (busy || !pending) return;
    busy = true;
    const save = pending;
    pending = undefined;
    onState("saving");
    try {
      const res = await fetch("api/save", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(save) });
      if (!res.ok) throw new Error(String(res.status));
      onState(pending ? "saving" : "saved");
    } catch {
      pending ??= save;
      onState("failed");
      clearTimeout(retry);
      retry = setTimeout(() => void flush(), 5000);
    } finally {
      busy = false;
    }
    if (pending && !retry) void flush();
  }

  return {
    save(s: Save) {
      pending = s;
      clearTimeout(retry);
      retry = undefined;
      void flush();
    },
  };
}
