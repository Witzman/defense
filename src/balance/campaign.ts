import { enemyCount, LEVELS } from "../content/levels.ts";
import { TURRET_TYPES } from "../content/turrets.ts";
import { runPoints } from "../game/points.ts";
import { deriveArsenal } from "../game/research.ts";
import { emptySave, recordRun, type Save } from "../game/save.ts";
import { createRng } from "../sim/rng.ts";
import { createWorld, DT, runToEnd, type LevelDef } from "../sim/world.ts";
import { placeGreedy, sampleFlow } from "./placement.ts";
import { bestKinds, spend, type Profile } from "./strategies.ts";

export interface LevelResult {
  level: number;
  /** Failed runs before the first win (farming runs on the previous level included); equals the cap when it never won. */
  failures: number;
  /** Of those, runs spent farming the previous level. */
  farmed: number;
  won: boolean;
  /** Points earned per run here, on average over the attempts. */
  pointsPerRun: number;
  /** Seconds of game time per run, on average. */
  seconds: number;
  /** Research nodes owned when the level was won (or given up). */
  research: number;
  /** Turrets placed in the winning (or last) run. */
  turrets: number;
  /** Share of enemies killed in the best run. */
  bestShare: number;
}

export interface CampaignOptions {
  profile: Profile;
  /** Level indices to play, in order (default all). */
  levels?: number[];
  /** Runs per level before the player counts as stuck. */
  maxAttempts?: number;
  seed?: number;
  /** Start from this save instead of a new game. */
  save?: Save;
  onLevel?: (r: LevelResult) => void;
}

/** One automated player through the campaign, with the game's own rules, points and research. */
export function playCampaign(o: CampaignOptions): { results: LevelResult[]; save: Save } {
  const rng = createRng(o.seed ?? 7);
  let save = o.save ?? emptySave();
  const results: LevelResult[] = [];
  const levels = o.levels ?? LEVELS.map((_, i) => i);
  const cap = o.maxAttempts ?? 60;
  for (const i of levels) {
    const level = LEVELS[i]!();
    const total = enemyCount(level);
    const flow = sampleFlow(level);
    let failures = 0;
    let won = false;
    let points = 0;
    let seconds = 0;
    let runs = 0;
    let turrets = 0;
    let bestShare = 0;
    let farmed = 0;
    while (!won && failures < cap) {
      save = spend(save, o.profile, level, rng);
      // Stuck far below the bar: a player farms the previous level when it pays more than a hopeless try here.
      if (failures >= 3 && bestShare < 0.25 && i > 0) {
        const p = farmPoints(save, i - 1);
        if (p > (points / Math.max(1, runs)) * 1.5) {
          save = { ...save, points: save.points + p };
          farmed++;
          failures++;
          continue;
        }
      }
      const arsenal = deriveArsenal(save.research);
      const order = bestKinds(level).filter((k) => arsenal.turrets[k]);
      for (const k of TURRET_TYPES.map((t) => t.id)) if (arsenal.turrets[k] && !order.includes(k)) order.push(k);
      const placements = placeGreedy(level, arsenal, flow, order);
      const w = createWorld(level, arsenal, placements, runs + 1);
      runToEnd(w);
      runs++;
      turrets = placements.length;
      seconds += w.tick * DT;
      points += runPoints(i, w.killed, total);
      bestShare = Math.max(bestShare, w.killed / total);
      save = recordRun(save, i, { status: w.status === "won" ? "won" : "lost", killed: w.killed, total, perfect: w.perfect }, LEVELS.length);
      if (w.status === "won") won = true;
      else failures++;
    }
    const r: LevelResult = { level: i + 1, failures, farmed, won, pointsPerRun: points / runs, seconds: seconds / runs, research: save.research.length, turrets, bestShare };
    results.push(r);
    o.onLevel?.(r);
    if (!won) break;
  }
  return { results, save };
}

/** What a run of `level` pays with the given save's research, placed greedily: for the "best farm" check. */
export function farmPoints(save: Save, levelIndex: number): number {
  const level: LevelDef = LEVELS[levelIndex]!();
  const arsenal = deriveArsenal(save.research);
  const order = bestKinds(level).filter((k) => arsenal.turrets[k]);
  const w = createWorld(level, arsenal, placeGreedy(level, arsenal, sampleFlow(level), order), 99);
  runToEnd(w);
  return runPoints(levelIndex, w.killed, enemyCount(level));
}
