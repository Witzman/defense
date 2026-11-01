import { describe, expect, it, vi } from "vitest";
import { applyMove, attachGestures, DOUBLE_TAP_MS, HOLD_MS, pinchMove, twistOf, type GestureHandlers } from "../../src/ui/gestures.ts";

const screen = (v: { scale: number; ox: number; oy: number }, w: { x: number; y: number }) => ({ x: w.x * v.scale + v.ox, y: w.y * v.scale + v.oy });

describe("gestures", () => {
  it("a pinch keeps the content under both fingers", () => {
    const v0 = { scale: 10, ox: 30, oy: -20 };
    const a0 = { x: 100, y: 100 }, b0 = { x: 200, y: 140 };
    const wa = { x: (a0.x - v0.ox) / v0.scale, y: (a0.y - v0.oy) / v0.scale };
    const wb = { x: (b0.x - v0.ox) / v0.scale, y: (b0.y - v0.oy) / v0.scale };
    const a1 = { x: 60, y: 90 }, b1 = { x: 260, y: 170 };
    const v1 = applyMove(v0, pinchMove(a0, b0, a1, b1), 0, 1000);
    expect(v1.scale).toBeCloseTo(20);
    expect(screen(v1, wa).x).toBeCloseTo(a1.x);
    expect(screen(v1, wa).y).toBeCloseTo(a1.y);
    expect(screen(v1, wb).x).toBeCloseTo(b1.x);
    expect(screen(v1, wb).y).toBeCloseTo(b1.y);
  });

  it("zoom stops at its limits", () => {
    const v = applyMove({ scale: 10, ox: 0, oy: 0 }, { k: 100, cx: 50, cy: 50, dx: 0, dy: 0 }, 5, 40);
    expect(v.scale).toBe(40);
  });

  it("two fingers moving together only pan", () => {
    const m = pinchMove({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 7 }, { x: 15, y: 7 });
    expect(m.k).toBe(1);
    expect([m.dx, m.dy]).toEqual([5, 7]);
  });
});


/** A fake element: records listeners; `fire` sends pointer events in CSS pixels. */
function fakeEl() {
  const on = new Map<string, ((ev: PointerEvent) => void)[]>();
  let t = 1000;
  return {
    addEventListener: (type: string, fn: (ev: PointerEvent) => void) => on.set(type, [...(on.get(type) ?? []), fn]),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    fire(type: string, id: number, x: number, y: number, pointerType = "touch") {
      t += 16;
      for (const fn of on.get(type) ?? []) fn({ type, pointerId: id, clientX: x, clientY: y, pointerType, button: 0, timeStamp: t } as unknown as PointerEvent);
    },
    wait(ms: number) {
      t += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

function record(over: Partial<GestureHandlers> = {}) {
  const log: string[] = [];
  const h: GestureHandlers = {
    move: (m) => log.push(m.k === 1 ? "pan" : "zoom"),
    tap: (_p, _ev, n) => log.push(n === 2 ? "double" : "tap"),
    drag: (p) => log.push(`drag ${p.x},${p.y}`),
    twist: (tw) => log.push(`twist ${tw.k.toFixed(1)} ${Math.round((tw.rot * 180) / Math.PI)}`),
    release: () => log.push("release"),
    ...over,
  };
  return { h, log };
}

describe("grabbing a turret (#25)", () => {
  it("drags a grabbed thing instead of panning, and releases it", () => {
    const el = fakeEl();
    const { h, log } = record({ grab: () => true });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointermove", 1, 130, 100);
    el.fire("pointermove", 1, 160, 100);
    el.fire("pointerup", 1, 160, 100);
    expect(log).toEqual(["drag 130,100", "drag 160,100", "release"]);
  });

  it("pans when the press is not on something grabbable", () => {
    const el = fakeEl();
    const { h, log } = record({ grab: () => false });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointermove", 1, 130, 100);
    el.fire("pointerup", 1, 130, 100);
    expect(log).toEqual(["pan"]);
  });

  it("grabs after a hold, then drags", () => {
    vi.useFakeTimers();
    const el = fakeEl();
    const hold = vi.fn(() => true);
    const { h, log } = record({ grab: () => false, hold });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.wait(HOLD_MS + 10);
    el.fire("pointermove", 1, 140, 100);
    el.fire("pointerup", 1, 140, 100);
    vi.useRealTimers();
    expect(hold).toHaveBeenCalledOnce();
    expect(log).toEqual(["drag 140,100", "release"]);
  });

  it("a hold that ends without moving is no tap", () => {
    vi.useFakeTimers();
    const el = fakeEl();
    const { h, log } = record({ hold: () => true });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.wait(HOLD_MS + 10);
    el.fire("pointerup", 1, 100, 100);
    vi.useRealTimers();
    expect(log).toEqual(["release"]);
  });

  it("a quick move before the hold pans", () => {
    vi.useFakeTimers();
    const el = fakeEl();
    const hold = vi.fn(() => true);
    const { h, log } = record({ hold });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointermove", 1, 140, 100);
    el.wait(HOLD_MS + 10);
    el.fire("pointerup", 1, 140, 100);
    vi.useRealTimers();
    expect(hold).not.toHaveBeenCalled();
    expect(log).toEqual(["pan"]);
  });

  it("two fingers around a grabbable thing twist it: spread and turn", () => {
    const el = fakeEl();
    const { h, log } = record({ grab2: () => true });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointerdown", 2, 200, 100);
    el.fire("pointermove", 2, 100, 200); // b turns 90° clockwise around a, same distance... from (200,100) to (100,200)
    el.fire("pointerup", 2, 100, 200);
    el.fire("pointerup", 1, 100, 100);
    expect(log[0]).toBe("twist 1.0 90");
    expect(log.at(-1)).toBe("release");
    expect(log).not.toContain("zoom");
  });

  it("two fingers elsewhere zoom the camera as before", () => {
    const el = fakeEl();
    const { h, log } = record({ grab2: () => false });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointerdown", 2, 200, 100);
    el.fire("pointermove", 2, 300, 100);
    expect(log).toEqual(["zoom"]);
  });

  it("a mouse never grabs: desktop stays as it was", () => {
    const el = fakeEl();
    const grab = vi.fn(() => true);
    const { h, log } = record({ grab });
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100, "mouse");
    el.fire("pointermove", 1, 140, 100, "mouse");
    el.fire("pointerup", 1, 140, 100, "mouse");
    expect(grab).not.toHaveBeenCalled();
    expect(log).toEqual(["pan"]);
  });
});

describe("double tap (#25)", () => {
  it("counts a second quick tap at the same place as a double tap", () => {
    const el = fakeEl();
    const { h, log } = record();
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointerup", 1, 100, 100);
    el.fire("pointerdown", 2, 104, 102);
    el.fire("pointerup", 2, 104, 102);
    el.fire("pointerdown", 3, 104, 102);
    el.fire("pointerup", 3, 104, 102);
    expect(log).toEqual(["tap", "double", "tap"]);
  });

  it("keeps slow or distant taps single", () => {
    vi.useFakeTimers();
    const el = fakeEl();
    const { h, log } = record();
    attachGestures(el, h);
    el.fire("pointerdown", 1, 100, 100);
    el.fire("pointerup", 1, 100, 100);
    el.wait(DOUBLE_TAP_MS + 50);
    el.fire("pointerdown", 2, 100, 100);
    el.fire("pointerup", 2, 100, 100);
    el.fire("pointerdown", 3, 200, 100);
    el.fire("pointerup", 3, 200, 100);
    vi.useRealTimers();
    expect(log).toEqual(["tap", "tap", "tap"]);
  });
});

describe("twistOf", () => {
  it("measures spread and turn", () => {
    const t = twistOf({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 20 });
    expect(t.k).toBeCloseTo(2);
    expect(t.rot).toBeCloseTo(Math.PI / 2);
  });
});
