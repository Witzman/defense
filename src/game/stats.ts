import type { TurretKind } from "../content/turrets.ts";
import type { Credit } from "../sim/stats.ts";
import type { World } from "../sim/world.ts";

/** The run analysis (#32), read off what the simulation counted (sim/stats.ts). */

export interface TypeLine {
  type: string;
  spawned: number;
  killed: number;
  /** Broke through, over all goals. */
  arrived: number;
  /** Broke through, per goal. */
  arrivedAt: number[];
}

export interface TurretLine {
  kind: TurretKind;
  x: number;
  y: number;
  kills: number;
  damage: number;
}

export interface Bucket extends Credit {
  name: string;
}

export interface GoalLine {
  /** Energy per second of the run, from the start to the end. */
  samples: number[];
  left: number;
  fell: boolean;
}

export interface Analysis {
  types: TypeLine[];
  turrets: TurretLine[];
  /** Kills and damage that are no turret's: burning, the precision shot, others. Only those that did something. */
  buckets: Bucket[];
  goals: GoalLine[];
  /** The goal that fell, else the one with the least energy left. */
  worstGoal: number;
  /** The three types with the most breakthroughs (only those that broke through). */
  topArrived: TypeLine[];
  /** Turrets with the most and the fewest kills (undefined without turrets; the same one if there is one). */
  best?: TurretLine;
  worst?: TurretLine;
}

export function analyse(w: World): Analysis {
  const s = w.stats;
  const goals = w.energies.length;
  const ids: string[] = [];
  for (const g of w.level.enemies.groups) if (!ids.includes(g.type)) ids.push(g.type);
  for (const id of [...Object.keys(s.spawned), ...Object.keys(s.arrived)]) if (!ids.includes(id)) ids.push(id);
  const types = ids.map((type) => {
    const arrivedAt = s.arrived[type] ?? new Array<number>(goals).fill(0);
    return { type, spawned: s.spawned[type] ?? 0, killed: s.killed[type] ?? 0, arrived: arrivedAt.reduce((a, b) => a + b, 0), arrivedAt };
  });
  const turrets = w.turrets.map((t) => ({ kind: t.kind, x: t.placement.x, y: t.placement.y, kills: t.kills, damage: t.damage }));
  const buckets = [
    { name: "Brand", ...s.burn },
    { name: "Präzisionsschuss", ...s.ability },
    { name: "Sonstiges", ...s.other },
  ].filter((b) => b.kills > 0 || b.damage > 0);
  const goalLines = w.energies.map((left, i) => ({ samples: s.energy[i]!, left, fell: left <= 0 }));
  let worstGoal = 0;
  w.energies.forEach((e, i) => e < w.energies[worstGoal]! && (worstGoal = i));
  const topArrived = types.filter((t) => t.arrived > 0).sort((a, b) => b.arrived - a.arrived).slice(0, 3);
  // Ties go to the turret placed first, so the same run names the same turrets.
  let best: TurretLine | undefined;
  let worst: TurretLine | undefined;
  for (const t of turrets) {
    if (!best || t.kills > best.kills || (t.kills === best.kills && t.damage > best.damage)) best = t;
    if (!worst || t.kills < worst.kills || (t.kills === worst.kills && t.damage < worst.damage)) worst = t;
  }
  return { types, turrets, buckets, goals: goalLines, worstGoal, topArrived, best, worst };
}
