import type { Point } from "../sim/map.ts";
import { runPoints } from "./points.ts";
import { START_POINTS } from "./research.ts";

/** Bump when the shape changes, and teach parseSave to read the old one. */
export const SAVE_VERSION = 1;

export interface LevelProgress {
  won: boolean;
  perfect: boolean;
  /** Where the turrets stood last time; kept between runs and sessions. */
  placements: Point[];
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
  if (r.version !== SAVE_VERSION) throw new Error(`unknown save version ${String(r.version)}`);
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
        placements: Array.isArray(lv.placements) ? lv.placements.filter(isPoint).map((p) => ({ x: p.x, y: p.y })) : [],
      };
    }
  }
  return {
    version: SAVE_VERSION,
    points: r.points,
    research: r.research.filter((x): x is string => typeof x === "string"),
    unlockedLevel: Number.isInteger(r.unlockedLevel) && (r.unlockedLevel as number) >= 0 ? (r.unlockedLevel as number) : 0,
    levels,
  };
}

function isPoint(p: unknown): p is Point {
  return typeof p === "object" && p !== null && Number.isInteger((p as Point).x) && Number.isInteger((p as Point).y);
}

function progress(s: Save, level: number): LevelProgress {
  return s.levels[level] ?? { won: false, perfect: false, placements: [] };
}

export function setPlacements(s: Save, level: number, placements: readonly Point[]): Save {
  return { ...s, levels: { ...s.levels, [level]: { ...progress(s, level), placements: placements.map((p) => ({ ...p })) } } };
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
