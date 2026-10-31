import { describe, expect, it } from "vitest";
import { createRng } from "../../src/sim/rng.ts";

describe("rng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs for different seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("stays in [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) covers 0..n-1", () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.int(5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
