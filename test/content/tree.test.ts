import { describe, expect, it } from "vitest";
import { ROOT, TREE } from "../../src/content/tree.ts";
import { TURRET_TYPES } from "../../src/content/turrets.ts";

const byId = new Map(TREE.map((n) => [n.id, n]));

describe("research tree", () => {
  it("has 1,000 to 1,200 nodes", () => {
    expect(TREE.length).toBeGreaterThanOrEqual(1000);
    expect(TREE.length).toBeLessThanOrEqual(1200);
  });

  it("has unique ids and links only to nodes that exist, both ways", () => {
    expect(byId.size).toBe(TREE.length);
    for (const n of TREE)
      for (const l of n.links) {
        expect(byId.has(l), `${n.id} -> ${l}`).toBe(true);
        expect(byId.get(l)!.links, `${l} back to ${n.id}`).toContain(n.id);
      }
  });

  it("every node can be reached from the start, synergies included", () => {
    // Buy greedily: anything touching an owned node whose requiresAll are owned.
    const owned = new Set([ROOT]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of TREE) {
        if (owned.has(n.id)) continue;
        if (n.links.some((l) => owned.has(l)) && (n.requiresAll ?? []).every((r) => owned.has(r))) {
          owned.add(n.id);
          grew = true;
        }
      }
    }
    expect(TREE.filter((n) => !owned.has(n.id)).map((n) => n.id)).toEqual([]);
  });

  it("every turret kind has its entry right at the start", () => {
    for (const t of TURRET_TYPES) expect(byId.get(t.id)!.links).toContain(ROOT);
  });

  it("costs grow with distance from the start", () => {
    const small = TREE.filter((n) => n.size === "small");
    const near = small.filter((n) => Math.hypot(n.x, n.y) < 25).map((n) => n.cost);
    const far = small.filter((n) => Math.hypot(n.x, n.y) > 45).map((n) => n.cost);
    expect(Math.min(...far)).toBeGreaterThan(Math.max(...near) / 4);
    expect(far.reduce((a, b) => a + b, 0) / far.length).toBeGreaterThan(near.reduce((a, b) => a + b, 0) / near.length * 2);
  });

  it("nodes do not sit on top of each other", () => {
    const tooClose: string[] = [];
    for (let i = 0; i < TREE.length; i++)
      for (let j = i + 1; j < TREE.length; j++) {
        const a = TREE[i]!;
        const b = TREE[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.9) tooClose.push(`${a.id}~${b.id}`);
      }
    expect(tooClose.slice(0, 10)).toEqual([]);
  });

  it("every node has a name and an effect (except the start)", () => {
    for (const n of TREE) {
      expect(n.name.length).toBeGreaterThan(0);
      if (n.id !== ROOT) expect(n.effects.length, n.id).toBeGreaterThan(0);
    }
  });
});
