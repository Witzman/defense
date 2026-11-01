/**
 * The curves balancing turns (#9). Every number here is checked by the balancing simulation
 * (`npm run balance`, report in balance/report.md); change them there, not where they are used.
 */
export const BALANCE = {
  /**
   * Hit points per enemy: base × growth^level, times the type's own hit points. Enemies scale by mass, not by
   * toughness (#2, #20): one enemy in level 25 is only ~3× as tough as in level 1; the count carries the rest.
   */
  hpBase: 6,
  hpGrowth: 1.05,
  /** Correction per level index on top of the curve (#11, found by `npm run balance:search`); missing = 1. */
  /** Level 1 (#41): a 20° arc at the start made it too hard for the random player; 0.6 keeps the guard of #9 green. */
  levelHp: { 0: 0.6 } as Record<number, number>,
  /** Correction of the points per kill per level index; missing = 1. */
  levelKillValue: {} as Record<number, number>,
  /** Research points per kill: growth^level, so the newest level pays best. */
  killValueGrowth: 1.45,
  /** Research cost: base × depthGrowth^(path length from the start) × size factor × progressGrowth^(nodes owned). */
  costBase: 15,
  costDepthGrowth: 1.2,
  costProgressGrowth: 1.01,
  /**
   * Avoiding danger (#39): extra cost of a cell at full danger, times the type's dangerAvoidance and the level's
   * learning. Learning grows from 0 at level `dangerLearnFrom` to 1 at `dangerLearnTo` (level numbers from 1).
   */
  dangerCost: 1.5,
  dangerLearnFrom: 3,
  dangerLearnTo: 25,
  /**
   * Seconds the taps of a level run: base + perLevel × level. Nearly the same in every level (owner, #22): a bigger
   * mass comes at a higher rate and in parallel from every spawn, not over a longer time.
   */
  spawnSecondsBase: 70,
  spawnSecondsPerLevel: 0.5,
};
