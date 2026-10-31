import { TURRET_TYPES, type TurretKind } from "../content/turrets.ts";
import type { Placement } from "../sim/world.ts";
import { runPoints } from "./points.ts";
import { CATALOG, START_POINTS } from "./research.ts";

/** Bump when the shape changes, and teach parseSave to read the old one. */
export const SAVE_VERSION = 2;

/**
 * Version 1 came before the research tree (#7). Its research ids the tree still knows are kept; every other one
 * is refunded with this many points, so a player loses nothing they paid for.
 */
export const LEGACY_REFUND = 50;

export interface LevelProgress {
  won: boolean;
  perfect: boolean;
  /** Where the turrets stood last time; kept between runs and sessions. */
  placements: Placement[];
}

export interface Save {
  version: number;
  points: number;
  research: string[];
  /** Highest level index the player may enter. */
  unlockedLevel: number;
  levels: Record<number, LevelProgress>;
}

export function emptySave(): Save {
  return { version: SAVE_VERSION, points: START_POINTS, research: [], unlockedLevel: 0, levels: {} };
}

/** Reads a save from the server. Throws on what is not a save; tolerates missing or malformed details. */
export function parseSave(raw: unknown): Save {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("save is not an object");
  const r = raw as Record<string, unknown>;
  if (r.version !== SAVE_VERSION && r.version !== 1) throw new Error(`unknown save version ${String(r.version)}`);
  if (typeof r.points !== "number" || !Number.isFinite(r.points)) throw new Error("save without points");
  if (!Array.isArray(r.research)) throw new Error("save without research");
  const levels: Record<number, LevelProgress> = {};
  if (typeof r.levels === "object" && r.levels !== null) {
    for (const [k, v] of Object.entries(r.levels as Record<string, unknown>)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || typeof v !== "object" || v === null) continue;
      const lv = v as Record<string, unknown>;
      levels[i] = {
        won: lv.won === true,
        perfect: lv.perfect === true,
        placements: Array.isArray(lv.placements) ? lv.placements.flatMap(readPlacement) : [],
      };
    }
  }
  let research = r.research.filter((x): x is string => typeof x === "string");
  let points = r.points;
  if (r.version === 1) {
    const known = new Set(CATALOG.map((n) => n.id));
    const kept = research.filter((id) => known.has(id));
    points += (research.length - kept.length) * LEGACY_REFUND;
    research = kept;
  }
  return {
    version: SAVE_VERSION,
    points,
    research,
    unlockedLevel: Number.isInteger(r.unlockedLevel) && (r.unlockedLevel as number) >= 0 ? (r.unlockedLevel as number) : 0,
    levels,
  };
}

const KINDS = new Set<string>(TURRET_TYPES.map((t) => t.id));

/** One stored placement, or none if it is malformed. Saves from before turret kinds hold bare cannons. */
function readPlacement(raw: unknown): Placement[] {
  if (typeof raw !== "object" || raw === null) return [];
  const p = raw as Record<string, unknown>;
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return [];
  const kind = p.kind ?? "cannon";
  if (typeof kind !== "string" || !KINDS.has(kind)) return [];
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return [{ x: p.x as number, y: p.y as number, kind: kind as TurretKind, facing: num(p.facing, 0), arc: num(p.arc, 360) }];
}

function progress(s: Save, level: number): LevelProgress {
  return s.levels[level] ?? { won: false, perfect: false, placements: [] };
}

export function setPlacements(s: Save, level: number, placements: readonly Placement[]): Save {
  return { ...s, levels: { ...s.levels, [level]: { ...progress(s, level), placements: placements.map((p) => ({ facing: 0, arc: 360, ...p })) } } };
}

export interface RunResult {
  status: "won" | "lost";
  killed: number;
  total: number;
  perfect: boolean;
}

/** Points for every run, won or lost; a win opens the next level (up to `levelCount`). */
export function recordRun(s: Save, level: number, r: RunResult, levelCount = Infinity): Save {
  const before = progress(s, level);
  const won = r.status === "won";
  return {
    ...s,
    points: s.points + runPoints(level, r.killed, r.total),
    unlockedLevel: won ? Math.max(s.unlockedLevel, Math.min(level + 1, levelCount - 1)) : s.unlockedLevel,
    levels: { ...s.levels, [level]: { ...before, won: before.won || won, perfect: before.perfect || (won && r.perfect) } },
  };
}
