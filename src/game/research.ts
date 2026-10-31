/**
 * Research: the only way to get turrets and make them stronger (#2). The catalog is the tree in
 * content/tree.ts; this module decides what can be bought and what the bought nodes add up to.
 */
import { turretType, type Pattern, type TurretKind, type TurretStats } from "../content/turrets.ts";
import { BALANCE } from "../content/balance.ts";
import { ROOT, TREE, type Effect, type PatternField, type ResearchNode } from "../content/tree.ts";
import type { Ability, Arsenal } from "../sim/world.ts";

export type { Effect, ResearchNode };
export const CATALOG: readonly ResearchNode[] = TREE;

/** Points a new player starts with: enough to unlock the first turret and buy a little more. */
export const START_POINTS = 100;

export const BASE_ABILITY: Ability = { damage: 2, radius: 1, cooldown: 8 };

/** The strongest slow a frost turret may reach; 1 would freeze a stream for good. */
const MAX_SLOW = 0.9;

const owns = (research: readonly string[], id: string) => id === ROOT || research.includes(id);

/** A node's price now: its base cost, dearer per node of its group already owned, and with overall progress. */
export function costOf(node: ResearchNode, research: readonly string[], catalog: readonly ResearchNode[] = CATALOG): number {
  const progress = BALANCE.costProgressGrowth ** research.length;
  if (!node.group) return Math.round(node.cost * progress);
  const owned = catalog.filter((n) => n.group?.id === node.group!.id && research.includes(n.id)).length;
  return Math.round(node.cost * node.group.growth ** owned * progress);
}

export interface Wallet {
  points: number;
  research: string[];
}

/** Not owned, affordable, touching an owned node, every required node owned — and a turret first. */
export function canBuy(w: Wallet, id: string, catalog: readonly ResearchNode[] = CATALOG): boolean {
  const node = catalog.find((n) => n.id === id);
  if (!node || owns(w.research, id)) return false;
  // No softlock: until a turret is researched, points go to a turret. Spent elsewhere they could never come back,
  // because a run without turrets earns nothing.
  const unlocks = (n: ResearchNode | undefined) => n?.effects.some((e) => e.kind === "unlock") ?? false;
  if (!unlocks(node) && !w.research.some((r) => unlocks(catalog.find((n) => n.id === r)))) return false;
  if (w.points < costOf(node, w.research, catalog)) return false;
  if (!node.links.some((l) => owns(w.research, l))) return false;
  return (node.requiresAll ?? []).every((r) => owns(w.research, r));
}

export function buy<T extends Wallet>(w: T, id: string, catalog: readonly ResearchNode[] = CATALOG): T {
  if (!canBuy(w, id, catalog)) throw new Error(`cannot buy ${id}`);
  const node = catalog.find((n) => n.id === id)!;
  return { ...w, points: w.points - costOf(node, w.research, catalog), research: [...w.research, id] };
}

interface KindState {
  unlocked: boolean;
  capacity: number;
  capacityMul: number;
  stats: TurretStats;
  pattern: Pattern;
}

/** Everything research has given: turret kinds with their capacity, stats and pattern, and the mouse ability. */
export function deriveArsenal(research: readonly string[], catalog: readonly ResearchNode[] = CATALOG): Arsenal {
  const byId = new Map(catalog.map((n) => [n.id, n]));
  const kinds = new Map<TurretKind, KindState>();
  const kind = (k: TurretKind) => {
    if (!kinds.has(k)) {
      const t = turretType(k);
      kinds.set(k, { unlocked: false, capacity: 0, capacityMul: 1, stats: { ...t.base }, pattern: { ...t.pattern } });
    }
    return kinds.get(k)!;
  };
  const effects: Effect[] = [];
  for (const id of research) effects.push(...(byId.get(id)?.effects ?? [])); // a save may name a node a later tree dropped
  const ability: Ability | undefined = effects.some((e) => e.kind === "abilityUnlock") ? { ...BASE_ABILITY } : undefined;
  for (const e of effects) {
    switch (e.kind) {
      case "unlock": kind(e.turret).unlocked = true; break;
      case "capacity": kind(e.turret).capacity += e.add; break;
      case "capacityMul": kind(e.turret).capacityMul *= e.mul; break;
      case "fireRate": kind(e.turret).stats.shotsPerSecond *= e.mul; break;
      case "range": kind(e.turret).stats.range += e.add; break;
      case "damage": kind(e.turret).stats.damage *= e.mul; break;
      case "turnRate": kind(e.turret).stats.turnRate *= e.mul; break;
      case "pattern": addToPattern(kind(e.turret).pattern, e.field, e.add); break;
      case "abilityDamage": if (ability) ability.damage *= e.mul; break;
      case "abilityRadius": if (ability) ability.radius += e.add; break;
      case "abilityCooldown": if (ability) ability.cooldown *= e.mul; break;
      case "abilityUnlock": break;
    }
  }
  const turrets: Arsenal["turrets"] = {};
  for (const [k, v] of kinds) {
    if (!v.unlocked) continue;
    turrets[k] = { capacity: Math.floor(v.capacity * v.capacityMul), stats: v.stats, pattern: v.pattern };
  }
  return ability ? { turrets, ability } : { turrets };
}

/** Adds to a pattern field the pattern has; a field it lacks is ignored (a cone has no jumps). */
function addToPattern(p: Pattern, field: PatternField, add: number) {
  const rec = p as unknown as Record<string, number | undefined>;
  if (field === "burnSeconds" && (p.kind === "splash" || p.kind === "cone")) {
    rec.burnSeconds = (rec.burnSeconds ?? 0) + add;
    return;
  }
  if (typeof rec[field] !== "number") return;
  rec[field] = rec[field]! + add;
  if (p.kind === "slow") p.factor = Math.min(MAX_SLOW, p.factor);
}
