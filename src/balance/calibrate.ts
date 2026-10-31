/**
 * Calibration (#11): fits the per-level hit point factor (BALANCE.levelHp) so typical players need about ten failed
 * runs per level. Level by level, in campaign order: the players carry their saves from the level before, so each
 * level is judged with the research a player really has when they get there.
 */
import { BALANCE } from "../content/balance.ts";
import { LEVEL_COUNT } from "../content/levels.ts";
import { emptySave, type Save } from "../game/save.ts";
import { playCampaign, type LevelResult } from "./campaign.ts";
import type { Profile } from "./strategies.ts";

export interface Trial {
  /** Failed runs before the first win, averaged over the profiles. */
  failures: number;
  /** A profile never won within the cap: a wall, never acceptable. */
  stuck: boolean;
}

export interface FitOptions {
  target: number;
  tolerance: number;
  start: number;
  maxTrials?: number;
}

/**
 * Searches the factor in log space: doubling or halving until the target is bracketed, then bisecting.
 * Returns the first factor within the tolerance, else the closest one where nobody got stuck.
 */
export function fitFactor(evaluate: (factor: number) => Trial, o: FitOptions): Trial & { factor: number } {
  let lo = 0;
  let hi = Infinity;
  let factor = o.start;
  let best: (Trial & { factor: number }) | undefined;
  let last: Trial & { factor: number } = { factor, failures: Infinity, stuck: true };
  for (let i = 0; i < (o.maxTrials ?? 8); i++) {
    const r = evaluate(factor);
    last = { factor, ...r };
    if (!r.stuck) {
      if (!best || Math.abs(r.failures - o.target) < Math.abs(best.failures - o.target)) best = last;
      if (Math.abs(r.failures - o.target) <= o.tolerance) return last;
    }
    if (r.stuck || r.failures > o.target) hi = factor;
    else lo = factor;
    factor = hi === Infinity ? factor * 2 : lo === 0 ? factor / 2 : Math.sqrt(lo * hi);
  }
  return best ?? last;
}

export interface CalibrateOptions {
  profiles: Profile[];
  levels?: number[];
  target?: number;
  tolerance?: number;
  /** Runs per level before a player counts as stuck. */
  cap?: number;
  log?: (line: string) => void;
}

/** Fits BALANCE.levelHp level by level (mutating it) and returns the factors and each profile's results. */
export function calibrate(o: CalibrateOptions): { levelHp: number[]; results: Map<Profile, LevelResult[]> } {
  const log = o.log ?? (() => {});
  const target = o.target ?? 10;
  const cap = o.cap ?? 40;
  const saves = new Map<Profile, Save>(o.profiles.map((p) => [p, emptySave()]));
  const results = new Map<Profile, LevelResult[]>(o.profiles.map((p) => [p, []]));
  for (const i of o.levels ?? Array.from({ length: LEVEL_COUNT }, (_, k) => k)) {
    const tried = new Map<number, { profile: Profile; result: LevelResult; save: Save }[]>();
    const play = (factor: number) => {
      BALANCE.levelHp[i] = factor;
      const runs = o.profiles.map((profile) => {
        const { results: r, save } = playCampaign({ profile, levels: [i], save: saves.get(profile)!, maxAttempts: cap });
        return { profile, result: r[0]!, save };
      });
      tried.set(factor, runs);
      const t: Trial = { failures: runs.reduce((n, x) => n + x.result.failures, 0) / runs.length, stuck: runs.some((x) => !x.result.won) };
      log(`L${i + 1} ×${factor.toFixed(3)}: ${runs.map((x) => `${x.profile} ${x.result.failures}${x.result.won ? "" : "!"}`).join(", ")}`);
      return t;
    };
    // Start from the factor the level before settled on: neighbouring levels are alike.
    const start = BALANCE.levelHp[i - 1] ?? 1;
    const fit = fitFactor(play, { target, tolerance: o.tolerance ?? 2, start });
    BALANCE.levelHp[i] = fit.factor;
    for (const x of tried.get(fit.factor)!) {
      saves.set(x.profile, x.save);
      results.get(x.profile)!.push(x.result);
    }
    log(`L${i + 1} settled ×${fit.factor.toFixed(3)} (mean ${fit.failures.toFixed(1)}${fit.stuck ? ", stuck" : ""})`);
    if (fit.stuck) break;
  }
  return { levelHp: [...BALANCE.levelHp], results };
}
