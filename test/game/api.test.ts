import { afterEach, describe, expect, it, vi } from "vitest";
import { createSaver, loadSave } from "../../src/game/api.ts";
import { emptySave } from "../../src/game/save.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fake server: answers PUT with the queued statuses (then 204) and records what landed. */
function fakeServer(statuses: number[]) {
  const stored: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const status = statuses.shift() ?? 204;
    if (status < 300) stored.push(JSON.parse(String(init?.body)));
    return new Response(null, { status });
  });
  return stored;
}

describe("saver", () => {
  it("retries a failed write until it lands", async () => {
    vi.useFakeTimers();
    const stored = fakeServer([500, 503]);
    const states: string[] = [];
    const saver = createSaver((s) => states.push(s));
    saver.save({ ...emptySave(), points: 42 });
    await vi.advanceTimersByTimeAsync(11000);
    expect(stored).toEqual([{ ...emptySave(), points: 42 }]);
    expect(states.at(-1)).toBe("saved");
    expect(states).toContain("failed");
  });

  it("writes the newest save when several come in quick succession", async () => {
    const stored = fakeServer([]);
    const saver = createSaver(() => {});
    saver.save({ ...emptySave(), points: 1 });
    saver.save({ ...emptySave(), points: 2 });
    saver.save({ ...emptySave(), points: 3 });
    await vi.waitFor(() => expect((stored.at(-1) as { points: number })?.points).toBe(3));
  });
});

describe("loading", () => {
  it("starts a new game when the server has none", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    expect(await loadSave()).toEqual(emptySave());
  });

  it("fails loudly on a server error instead of pretending a new game", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 500 }));
    await expect(loadSave()).rejects.toThrow();
  });
});
