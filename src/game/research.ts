/**
 * Research: the only way to get turrets and make them stronger (#2). A node costs points, needs other nodes,
 * and has effects. Effects apply to every turret of a kind at once. Milestone E replaces the catalog with the
 * large tree; this core stays.
 */
import { TURRET_TYPES, turretType, type TurretKind, type TurretStats } from "../content/turrets.ts";
import type { Ability, Arsenal } from "../sim/world.ts";

export type Effect =
  | { kind: "unlock"; turret: TurretKind }
  | { kind: "capacity"; turret: TurretKind; add: number }
  | { kind: "fireRate"; turret: TurretKind; mul: number }
  | { kind: "range"; turret: TurretKind; add: number }
  | { kind: "damage"; turret: TurretKind; mul: number }
  | { kind: "turnRate"; turret: TurretKind; mul: number }
  | { kind: "abilityUnlock" }
  | { kind: "abilityDamage"; mul: number }
  | { kind: "abilityRadius"; add: number }
  | { kind: "abilityCooldown"; mul: number };

export interface ResearchNode {
  id: string;
  name: string;
  cost: number;
  requires: string[];
  effects: Effect[];
  /**
   * Nodes of one group get dearer with every node of the group already owned: cost × growth^owned. Used for
   * turret unlocks — the first kind is cheap, each further direction costs more grinding (#2).
   */
  group?: { id: string; growth: number };
}

/** Points a new player starts with: enough to unlock the first turret and buy a little more. */
export const START_POINTS = 100;

export const BASE_ABILITY: Ability = { damage: 2, radius: 1, cooldown: 8 };

export function costOf(node: ResearchNode, research: readonly string[], catalog: readonly ResearchNode[] = CATALOG): number {
  if (!node.group) return node.cost;
  const owned = catalog.filter((n) => n.group?.id === node.group!.id && research.includes(n.id)).length;
  return Math.round(node.cost * node.group.growth ** owned);
}

/** Everything research has given: turret kinds with their capacity and stats, and the mouse ability. */
export function deriveArsenal(research: readonly string[], catalog: readonly ResearchNode[] = CATALOG): Arsenal {
  const byId = new Map(catalog.map((n) => [n.id, n]));
  const kinds = new Map<TurretKind, { unlocked: boolean; capacity: number; stats: TurretStats }>();
  const kind = (k: TurretKind) => {
    if (!kinds.has(k)) kinds.set(k, { unlocked: false, capacity: 0, stats: { ...turretType(k).base } });
    return kinds.get(k)!;
  };
  let ability: Ability | undefined;
  const pending: Effect[] = [];
  for (const id of research) {
    const node = byId.get(id);
    if (node) pending.push(...node.effects); // a save may name a node a later catalog dropped
  }
  for (const e of pending) if (e.kind === "abilityUnlock") ability = { ...BASE_ABILITY };
  for (const e of pending) {
    switch (e.kind) {
      case "unlock": kind(e.turret).unlocked = true; break;
      case "capacity": kind(e.turret).capacity += e.add; break;
      case "fireRate": kind(e.turret).stats.shotsPerSecond *= e.mul; break;
      case "range": kind(e.turret).stats.range += e.add; break;
      case "damage": kind(e.turret).stats.damage *= e.mul; break;
      case "turnRate": kind(e.turret).stats.turnRate *= e.mul; break;
      case "abilityDamage": if (ability) ability.damage *= e.mul; break;
      case "abilityRadius": if (ability) ability.radius += e.add; break;
      case "abilityCooldown": if (ability) ability.cooldown *= e.mul; break;
      case "abilityUnlock": break;
    }
  }
  const turrets: Arsenal["turrets"] = {};
  for (const [k, v] of kinds) if (v.unlocked) turrets[k] = { capacity: v.capacity, stats: v.stats };
  return ability ? { turrets, ability } : { turrets };
}

export interface Wallet {
  points: number;
  research: string[];
}

export function canBuy(w: Wallet, id: string, catalog: readonly ResearchNode[] = CATALOG): boolean {
  const node = catalog.find((n) => n.id === id);
  if (!node || w.research.includes(id) || w.points < costOf(node, w.research, catalog)) return false;
  return node.requires.every((r) => w.research.includes(r));
}

export function buy<T extends Wallet>(w: T, id: string, catalog: readonly ResearchNode[] = CATALOG): T {
  if (!canBuy(w, id, catalog)) throw new Error(`cannot buy ${id}`);
  const node = catalog.find((n) => n.id === id)!;
  return { ...w, points: w.points - costOf(node, w.research, catalog), research: [...w.research, id] };
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

function branch(k: TurretKind): ResearchNode[] {
  const t = turretType(k);
  return [
    { id: k, name: t.name, cost: 60, requires: [], effects: [{ kind: "unlock", turret: k }, { kind: "capacity", turret: k, add: 2 }], group: { id: "unlock", growth: 4 } },
    ...chain(`${k}-cap`, `${t.name}: Anzahl`, 25, 1.6, 8, k, { kind: "capacity", turret: k, add: 1 }),
    ...chain(`${k}-rate`, `${t.name}: Feuerrate`, 40, 1.75, 6, k, { kind: "fireRate", turret: k, mul: 1.3 }),
    ...chain(`${k}-range`, `${t.name}: Reichweite`, 50, 1.8, 4, k, { kind: "range", turret: k, add: 1 }),
    ...chain(`${k}-dmg`, `${t.name}: Schaden`, 60, 1.8, 6, k, { kind: "damage", turret: k, mul: 1.5 }),
    ...chain(`${k}-turn`, `${t.name}: Schwenken`, 30, 1.7, 3, k, { kind: "turnRate", turret: k, mul: 1.5 }),
  ];
}

/** The catalog of milestone D: one branch per turret kind plus the mouse ability. */
export const CATALOG: ResearchNode[] = [
  ...TURRET_TYPES.flatMap((t) => branch(t.id)),
  { id: "ability", name: "Präzisionsschuss", cost: 80, requires: [], effects: [{ kind: "abilityUnlock" }] },
  ...chain("ability-dmg", "Präzisionsschuss: Schaden", 60, 1.8, 5, "ability", { kind: "abilityDamage", mul: 1.6 }),
  ...chain("ability-radius", "Präzisionsschuss: Fläche", 70, 1.9, 3, "ability", { kind: "abilityRadius", add: 0.5 }),
  ...chain("ability-cd", "Präzisionsschuss: Abklingzeit", 70, 1.9, 4, "ability", { kind: "abilityCooldown", mul: 0.8 }),
];
