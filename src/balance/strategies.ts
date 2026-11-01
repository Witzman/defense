import { ENEMY_TYPES, vulnerability } from "../content/enemies.ts";
import { TURRET_TYPES, turretType, type TurretKind } from "../content/turrets.ts";
import { ROOT, type Effect, type ResearchNode } from "../content/tree.ts";
import { buy, canBuy, CATALOG, costOf, deriveArsenal } from "../game/research.ts";
import type { Save } from "../game/save.ts";
import type { Rng } from "../sim/rng.ts";
import type { Arsenal, LevelDef } from "../sim/world.ts";

export type Profile = "specialist" | "generalist" | "random" | "optimizer";
export const PROFILES: Profile[] = ["specialist", "generalist", "random", "optimizer"];

const byId = new Map(CATALOG.map((n) => [n.id, n]));
const owned = (s: Save, id: string) => id === ROOT || s.research.includes(id);

/** Share of a turret kind's damage the level's enemies take, weighted by their numbers. */
export function effectiveness(kind: TurretKind, level: LevelDef): number {
  const t = turretType(kind);
  let sum = 0;
  let n = 0;
  for (const g of level.enemies.groups) {
    const e = ENEMY_TYPES.find((x) => x.id === g.type)!;
    let v = vulnerability(e, t.damageType);
    if (t.pattern.kind === "beam" && e.instantKillImmune) v = 0;
    sum += v * g.count;
    n += g.count;
  }
  return n ? sum / n : 1;
}

const PATTERN_FACTOR: Record<string, number> = { single: 1, splash: 2.5, cone: 2.5, beam: 1, chain: 2, pierce: 2, slow: 1.2 };

/** Rough damage per second of everything a kind brings, against this level. */
export function kindPower(a: Arsenal, kind: TurretKind, level: LevelDef): number {
  const k = a.turrets[kind];
  if (!k) return 0;
  const hpEach = 3 * (level.enemies.hpScale ?? 1);
  const t = turretType(kind);
  const perShot = t.pattern.kind === "beam" && k.stats.damage >= hpEach ? hpEach : k.stats.damage;
  // A narrow arc covers less of the stream (#41): from 0.3 at the start to 1 at the widest.
  const procs = Object.values(k.procs ?? {}).reduce((s, p) => s + Math.min(1, p.chance) * (1 + p.power), 0);
  const arcFactor = 0.3 + 0.7 * (Math.min(k.stats.arc ?? 360, 180) / 180);
  return k.capacity * perShot * k.stats.shotsPerSecond * (PATTERN_FACTOR[t.pattern.kind] ?? 1) * (0.6 + 0.1 * k.stats.range) * effectiveness(kind, level) * arcFactor * (1 + 0.8 * procs);
}

export function arsenalPower(a: Arsenal, level: LevelDef): number {
  return TURRET_TYPES.reduce((sum, t) => sum + kindPower(a, t.id, level), 0);
}

/** Kinds by how much a freshly unlocked one does against this level. */
export function bestKinds(level: LevelDef): TurretKind[] {
  const fresh = (k: TurretKind) => kindPower(deriveArsenal([k]), k, level);
  return TURRET_TYPES.map((t) => t.id).sort((a, b) => fresh(b) - fresh(a));
}

function affordable(s: Save): ResearchNode[] {
  return CATALOG.filter((n) => canBuy(s, n.id));
}

/** The gain in power per point of a purchase, judged by simulating the arsenal with and without it. */
function valuePerCost(s: Save, n: ResearchNode, level: LevelDef, base: number): number {
  const after = arsenalPower(deriveArsenal([...s.research, n.id]), level);
  return (after - base) / costOf(n, s.research);
}

/**
 * Spends the points the way the profile would. Buys until nothing it wants is affordable; returns the new save.
 * - specialist: one kind (the best for the level), its own cluster first; a second kind only if the first is useless here
 * - generalist: up to three kinds of different damage types, purchases spread round robin
 * - random: random affordable nodes
 * - optimizer: the purchase with the highest power gain per point, every time
 */
export function spend(s: Save, profile: Profile, level: LevelDef, rng: Rng): Save {
  for (let guard = 0; guard < 2000; guard++) {
    const options = affordable(s);
    if (options.length === 0) return s;
    let pick: ResearchNode | undefined;
    const arsenal = deriveArsenal(s.research);
    const kinds = TURRET_TYPES.map((t) => t.id).filter((k) => arsenal.turrets[k]);
    switch (profile) {
      case "random":
        pick = options[rng.int(options.length)];
        break;
      case "optimizer": {
        const base = arsenalPower(arsenal, level);
        let best = 0;
        for (const n of options) {
          const v = valuePerCost(s, n, level, base);
          if (v > best) [best, pick] = [v, n];
        }
        break;
      }
      case "specialist": {
        const main = kinds.find((k) => effectiveness(k, level) > 0.3) ?? bestKinds(level)[0]!;
        if (!owned(s, main)) {
          pick = options.find((n) => n.id === main);
          if (!pick) return s; // save up for the unlock
          break;
        }
        pick = cheapestIn(options, (n) => n.cluster === main) ?? cheapestIn(options, (n) => n.cluster !== "bridge" && !TURRET_TYPES.some((t) => t.id === n.cluster));
        break;
      }
      case "generalist": {
        const wanted = pickSpread(level);
        const missing = wanted.find((k) => !owned(s, k));
        if (missing && kinds.length < 3) {
          pick = options.find((n) => n.id === missing);
          if (!pick) return s;
          break;
        }
        // Round robin: the owned kind with the fewest nodes in its cluster gets the next one.
        const counts = kinds.map((k) => [k, s.research.filter((id) => byId.get(id)?.cluster === k).length] as const).sort((a, b) => a[1] - b[1]);
        for (const [k] of counts) {
          pick = cheapestIn(options, (n) => n.cluster === k);
          if (pick) break;
        }
        pick ??= cheapestIn(options, () => true);
        break;
      }
    }
    if (!pick) return s;
    s = buy(s, pick.id);
  }
  return s;
}

function cheapestIn(options: ResearchNode[], f: (n: ResearchNode) => boolean): ResearchNode | undefined {
  let best: ResearchNode | undefined;
  for (const n of options) if (f(n) && (!best || n.cost < best.cost)) best = n;
  return best;
}

/** Three kinds of different damage types, best suited first. */
function pickSpread(level: LevelDef): TurretKind[] {
  const out: TurretKind[] = [];
  for (const k of bestKinds(level)) {
    if (out.some((o) => turretType(o).damageType === turretType(k).damageType)) continue;
    out.push(k);
    if (out.length === 3) break;
  }
  return out;
}

export type { Effect };
