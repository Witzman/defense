import { BALANCE } from "../content/balance.ts";
import { enemyCount, LEVELS } from "../content/levels.ts";
import { runPoints } from "../game/points.ts";
import { deriveArsenal } from "../game/research.ts";
import type { Save } from "../game/save.ts";
import { WATER } from "../sim/map.ts";
import { createWorld, DT, REROUTE_TICKS, step, type World } from "../sim/world.ts";
import { playCampaign } from "./campaign.ts";
import { bestKinds, type Profile } from "./strategies.ts";
import { placeGreedy, sampleFlow } from "./placement.ts";
import { TURRET_TYPES } from "../content/turrets.ts";

/**
 * The balancing criteria of #11 (owner, 2026-11-01): a level is right when
 * - the generalist (typical player) needs 6–14 failed runs,
 * - the random player at most 40 (no softlock) — only watched since 2026-11-01 (see below).
 * The optimizer and the specialist are only watched (owner, 2026-11-01: the optimizer wins far earlier than any
 * real player, so a minimum of failures for it cannot hold together with the generalist's).
 */
export const CORRIDOR = {
  generalist: { min: 6, max: 14, target: 10 },
  random: { max: 40 },
};
/** Profiles the search plays; the optimizer is in to hand on its save and for the report, not for the verdict. */
// Random player (#11, finding): from level 3 on, with the research-only arc (#41), a player who buys nodes at random has
// four turrets and kills 2 % even after 100 tries and 10× the points. That is not a level to tune towards, so the
// search gates on the generalist; the random player is run only on request (BALANCE_PROFILES) and the guard test of
// level 1 (random wins within 40) still holds.
export const CORRIDOR_PROFILES: Profile[] = (process.env.BALANCE_PROFILES?.split(",") as Profile[] | undefined) ?? ["generalist"];

/** Failed runs after which a profile's verdict is certain, so the run can stop early. */
export function capFor(profile: Profile): number {
  switch (profile) {
    case "generalist": return CORRIDOR.generalist.max + 2;
    case "optimizer": return 60;
    case "random": return CORRIDOR.random.max + 1;
    case "specialist": return 30;
  }
}

/** How far a profile's failed runs lie outside the corridor; 0 = inside. */
export function miss(profile: Profile, failures: number, won: boolean): number {
  switch (profile) {
    case "generalist": return !won ? 10 : Math.max(0, CORRIDOR.generalist.min - failures, failures - CORRIDOR.generalist.max);
    case "optimizer": return 0;
    case "random": return 0;
    case "specialist": return 0;
  }
}

/** Run time at 1× (#2): level index → [min, max] seconds. */
export function durationRange(levelIndex: number): [number, number] {
  return levelIndex < 10 ? [60, 120] : levelIndex < 20 ? [120, 180] : [120, 240];
}

export interface Diagnostics {
  /** Seconds of game time of one run with the profile's arsenal. */
  seconds: number;
  /** Share of the run time in which at least 5 % of the water cells are full (jams, #11 criterion 4). */
  jamShare: number;
  /** Share of deep water (depth ≥ 4) within reach of the longest range of the arsenal (criterion 8). */
  deepReach: number;
  /** Share of the map that is water (criterion 7). */
  waterShare: number;
  /** Points per minute on this level against the best of the earlier ones, same arsenal (criterion 5). */
  pointsPerMinute: number;
  bestEarlierPerMinute: number;
  /** Research nodes owned. */
  nodes: number;
}

function jamShareOf(w: World): number {
  const map = w.level.map;
  let wet = 0;
  for (let i = 0; i < map.cells.length; i++) if (map.cells[i] === WATER) wet++;
  let samples = 0;
  let jammed = 0;
  for (let t = 0; t < 30 * 600 && w.status === "running"; t++) {
    step(w);
    if (t % REROUTE_TICKS !== 0) continue;
    let full = 0;
    for (let i = 0; i < map.cells.length; i++) if (map.cells[i] === WATER && w.density[i]! >= w.cellCapacity) full++;
    samples++;
    if (full >= 0.05 * wet) jammed++;
  }
  return samples ? jammed / samples : 0;
}

/** One run of level `i` with the research of `save`, placed greedily, with the figures of the criteria. */
export function diagnose(i: number, save: Save): Diagnostics {
  const level = LEVELS[i]!();
  const arsenal = deriveArsenal(save.research);
  const order = bestKinds(level).filter((k) => arsenal.turrets[k]);
  const placements = placeGreedy(level, arsenal, sampleFlow(level), order);
  const w = createWorld(level, arsenal, placements);
  const jamShare = jamShareOf(w);
  const seconds = w.tick * DT;
  const per = (idx: number, killed: number, secs: number) => runPoints(idx, killed, enemyCount(LEVELS[idx]!())) / Math.max(1, secs / 60);
  let bestEarlier = 0;
  for (let j = Math.max(0, i - 3); j < i; j++) {
    const lv = LEVELS[j]!();
    const e = createWorld(lv, arsenal, placeGreedy(lv, arsenal, sampleFlow(lv), bestKinds(lv).filter((k) => arsenal.turrets[k])), 99);
    for (let t = 0; t < 30 * 600 && e.status === "running"; t++) step(e);
    bestEarlier = Math.max(bestEarlier, per(j, e.killed, e.tick * DT));
  }
  const map = level.map;
  let wet = 0;
  let deep = 0;
  let deepIn = 0;
  const reach = Math.max(0, ...TURRET_TYPES.map((t) => arsenal.turrets[t.id]?.stats.range ?? 0));
  for (let k = 0; k < map.cells.length; k++) {
    if (map.cells[k] !== WATER) continue;
    wet++;
    if (w.depth[k]! >= 4) {
      deep++;
      if (w.depth[k]! <= reach) deepIn++;
    }
  }
  return {
    seconds,
    jamShare,
    deepReach: deep ? deepIn / deep : 1,
    waterShare: wet / map.cells.length,
    pointsPerMinute: per(i, w.killed, seconds),
    bestEarlierPerMinute: bestEarlier,
    nodes: save.research.length,
  };
}

export interface Job {
  level: number;
  profile: Profile;
  save: Save;
  /** Values laid over BALANCE for this job only. */
  overrides?: Partial<Pick<typeof BALANCE, "levelHp" | "levelKillValue" | "killValueScale" | "dangerCost" | "hpGrowth" | "killValueGrowth" | "costBase" | "costDepthGrowth" | "costProgressGrowth">>;
  cap?: number;
  diag?: boolean;
}

export interface JobResult {
  level: number;
  profile: Profile;
  failures: number;
  won: boolean;
  seconds: number;
  /** The save the player has after winning (the preset of the next level), if they won. */
  after?: Save;
  diag?: Diagnostics;
  ms: number;
}

/** Plays one level for one profile from a preset. */
export function runJob(job: Job): JobResult {
  const t0 = performance.now();
  Object.assign(BALANCE, job.overrides ?? {});
  const { results, save } = playCampaign({ profile: job.profile, levels: [job.level], save: job.save, maxAttempts: job.cap ?? capFor(job.profile) });
  const r = results[0]!;
  const out: JobResult = { level: job.level, profile: job.profile, failures: r.failures, won: r.won, seconds: r.seconds, ms: 0 };
  if (r.won) out.after = save;
  if (job.diag) out.diag = diagnose(job.level, job.save);
  out.ms = performance.now() - t0;
  return out;
}
