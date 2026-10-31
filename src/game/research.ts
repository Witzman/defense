/**
 * Research: the only way to get turrets and make them stronger (#2). A node costs points, needs other nodes,
 * and has effects. Effects apply to every turret of the type at once. Milestone E replaces the catalog with the
 * large tree; this core stays.
 */

export type Effect =
  | { kind: "unlock" }
  | { kind: "capacity"; add: number }
  | { kind: "fireRate"; mul: number }
  | { kind: "range"; add: number }
  | { kind: "damage"; mul: number };

export interface ResearchNode {
  id: string;
  name: string;
  cost: number;
  requires: string[];
  effects: Effect[];
}

export interface TurretStats {
  range: number;
  damage: number;
  shotsPerSecond: number;
}

/** What research has given the player: whether the turret exists, how many may stand, how strong each is. */
export interface Loadout {
  unlocked: boolean;
  capacity: number;
  turret: TurretStats;
}

export const BASE_TURRET: TurretStats = { range: 4, damage: 1, shotsPerSecond: 3 };

/** Points a new player starts with: enough to unlock the first turret and buy a little more. */
export const START_POINTS = 100;

export function deriveLoadout(research: readonly string[], catalog: readonly ResearchNode[] = CATALOG): Loadout {
  const byId = new Map(catalog.map((n) => [n.id, n]));
  const out: Loadout = { unlocked: false, capacity: 0, turret: { ...BASE_TURRET } };
  for (const id of research) {
    const node = byId.get(id);
    if (!node) continue; // a save may name a node a later catalog dropped
    for (const e of node.effects) {
      if (e.kind === "unlock") out.unlocked = true;
      else if (e.kind === "capacity") out.capacity += e.add;
      else if (e.kind === "fireRate") out.turret.shotsPerSecond *= e.mul;
      else if (e.kind === "range") out.turret.range += e.add;
      else if (e.kind === "damage") out.turret.damage *= e.mul;
    }
  }
  if (!out.unlocked) out.capacity = 0;
  return out;
}

export interface Wallet {
  points: number;
  research: string[];
}

export function canBuy(w: Wallet, id: string, catalog: readonly ResearchNode[] = CATALOG): boolean {
  const node = catalog.find((n) => n.id === id);
  if (!node || w.research.includes(id) || w.points < node.cost) return false;
  return node.requires.every((r) => w.research.includes(r));
}

export function buy<T extends Wallet>(w: T, id: string, catalog: readonly ResearchNode[] = CATALOG): T {
  if (!canBuy(w, id, catalog)) throw new Error(`cannot buy ${id}`);
  const node = catalog.find((n) => n.id === id)!;
  return { ...w, points: w.points - node.cost, research: [...w.research, id] };
}

/** A chain of nodes, each needing the one before, with costs growing by `growth`. */
function chain(prefix: string, name: string, first: number, growth: number, steps: number, root: string, effect: Effect): ResearchNode[] {
  return Array.from({ length: steps }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: `${name} ${i + 1}`,
    cost: Math.round(first * growth ** i),
    requires: [i === 0 ? root : `${prefix}-${i}`],
    effects: [effect],
  }));
}

/** The small catalog of milestone C. */
export const CATALOG: ResearchNode[] = [
  { id: "cannon", name: "Kanone", cost: 60, requires: [], effects: [{ kind: "unlock" }, { kind: "capacity", add: 2 }] },
  ...chain("cannon-cap", "Kanonen-Kapazität", 25, 1.6, 8, "cannon", { kind: "capacity", add: 1 }),
  ...chain("cannon-rate", "Feuerrate", 40, 1.75, 6, "cannon", { kind: "fireRate", mul: 1.3 }),
  ...chain("cannon-range", "Reichweite", 50, 1.8, 4, "cannon", { kind: "range", add: 1 }),
  ...chain("cannon-dmg", "Schaden", 60, 1.8, 6, "cannon", { kind: "damage", mul: 1.5 }),
];
