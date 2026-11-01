/**
 * Research: the only way to get turrets and make them stronger (#2). The catalog is the tree in
 * content/tree.ts; this module decides what can be bought and what the bought nodes add up to.
 */
import { MAX_ARC, START_ARC, turretType, type Combo, type Pattern, type ProcKind, type TurretKind, type TurretStats } from "../content/turrets.ts";
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
  /** Sum of (mul − 1) per multiplied value: bonuses add up (#19), so ten +20 % nodes give +200 %, not ×6.2. */
  bonus: Record<"capacity" | "fireRate" | "damage" | "turnRate" | "arc", number>;
  procs: Partial<Record<ProcKind, { chance: number; power: number }>>;
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
      kinds.set(k, { unlocked: false, capacity: 0, bonus: { capacity: 0, fireRate: 0, damage: 0, turnRate: 0, arc: 0 }, procs: {}, stats: { ...t.base }, pattern: { ...t.pattern } });
    }
    return kinds.get(k)!;
  };
  const effects: Effect[] = [];
  for (const id of research) effects.push(...(byId.get(id)?.effects ?? [])); // a save may name a node a later tree dropped
  const ability: Ability | undefined = effects.some((e) => e.kind === "abilityUnlock") ? { ...BASE_ABILITY } : undefined;
  const abilityBonus = { damage: 0, cooldown: 0 };
  const combos = new Set<Combo>();
  for (const e of effects) {
    switch (e.kind) {
      case "unlock": kind(e.turret).unlocked = true; break;
      case "capacity": kind(e.turret).capacity += e.add; break;
      case "capacityMul": kind(e.turret).bonus.capacity += e.mul - 1; break;
      case "fireRate": kind(e.turret).bonus.fireRate += e.mul - 1; break;
      case "range": kind(e.turret).stats.range += e.add; break;
      case "damage": kind(e.turret).bonus.damage += e.mul - 1; break;
      case "turnRate": kind(e.turret).bonus.turnRate += e.mul - 1; break;
      case "proc": {
        const p = (kind(e.turret).procs[e.proc] ??= { chance: 0, power: 0 });
        p.chance += e.chance;
        break;
      }
      case "procPower": {
        const p = (kind(e.turret).procs[e.proc] ??= { chance: 0, power: 0 });
        p.power += e.add;
        break;
      }
      case "combo": combos.add(e.combo); break;
      case "arc": kind(e.turret).bonus.arc += e.add; break;
      case "pattern": addToPattern(kind(e.turret).pattern, e.field, e.add); break;
      case "abilityDamage": abilityBonus.damage += e.mul - 1; break;
      case "abilityRadius": if (ability) ability.radius += e.add; break;
      case "abilityCooldown": abilityBonus.cooldown += e.mul - 1; break;
      case "abilityUnlock": break;
    }
  }
  if (ability) {
    ability.damage *= factor(abilityBonus.damage);
    ability.cooldown *= Math.max(MIN_COOLDOWN_FACTOR, 1 + abilityBonus.cooldown);
  }
  const turrets: Arsenal["turrets"] = {};
  for (const [k, v] of kinds) {
    if (!v.unlocked) continue;
    const stats = { ...v.stats, shotsPerSecond: v.stats.shotsPerSecond * factor(v.bonus.fireRate), damage: v.stats.damage * factor(v.bonus.damage), turnRate: v.stats.turnRate * factor(v.bonus.turnRate), arc: Math.min(MAX_ARC, START_ARC + v.bonus.arc) };
    turrets[k] = { capacity: Math.floor(v.capacity * factor(v.bonus.capacity)), stats, pattern: v.pattern, procs: v.procs };
  }
  return { turrets, ...(ability ? { ability } : {}), ...(combos.size ? { combos: [...combos] } : {}) };
}

/** Adds to a pattern field the pattern has; a field it lacks is ignored (a cone has no jumps). */
/** Shortest cooldown research can reach, as a share of the base. */
export const MIN_COOLDOWN_FACTOR = 0.25;
/** A summed bonus as a factor; penalties never take a value below a tenth. */
const factor = (bonus: number) => Math.max(0.1, 1 + bonus);

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
