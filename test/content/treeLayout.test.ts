import { describe, expect, it } from "vitest";
import { NODE_RADIUS, type ResearchNode } from "../../src/content/tree.ts";
import { CATALOG } from "../../src/game/research.ts";

/** Visible radius: the outer ring of keystones and the start counts. */
const reach = (n: ResearchNode) => NODE_RADIUS[n.size] * (n.size === "keystone" || n.size === "start" ? 1.35 : 1);
/** Clear space required between two drawn things, in tree units. */
const GAP = 0.15;

function segDist(px: number, py: number, a: ResearchNode, b: ResearchNode): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function overlaps(nodes: readonly ResearchNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pairs: string[] = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < reach(a) + reach(b) + GAP) pairs.push(`${a.id} ~ ${b.id}`);
    }
  const crossings: string[] = [];
  for (const a of nodes)
    for (const id of a.links) {
      if (a.id > id) continue;
      const b = byId.get(id)!;
      for (const n of nodes) {
        if (n === a || n === b) continue;
        if (segDist(n.x, n.y, a, b) < reach(n) + GAP) crossings.push(`${a.id}–${b.id} through ${n.id}`);
      }
    }
  return { pairs, crossings };
}

describe("research tree layout (#23)", () => {
  const { pairs, crossings } = overlaps(CATALOG);
  it("has no two nodes covering each other", () => {
    expect(pairs).toEqual([]);
  });
  it("has no line running through a node it does not belong to", () => {
    expect(crossings).toEqual([]);
  });
});
