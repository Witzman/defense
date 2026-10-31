import { describe, expect, it } from "vitest";
import { applyMove, pinchMove } from "../../src/ui/gestures.ts";

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
