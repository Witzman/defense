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
  /** Level 1 (#41, #40): 20° arcs made it harder, cohesion easier; 0.8 keeps both guards of #9 green (0.7 and 0.9 do not). */
  levelHp: { 0: 0.8, 1: 1.673, 2: 2.58, 3: 9.457, 4: 7.484, 5: 1.454, 6: 16.59, 7: 1.454, 8: 1.454 } as Record<number, number>,
  /** Correction of the points per kill per level index; missing = 1. */
  levelKillValue: { 1: 1.068, 2: 2.195, 3: 2.843, 4: 2.422, 5: 1.775, 6: 2.275, 7: 1.667, 8: 1.221 } as Record<number, number>,
  /** Research points per kill: scale × growth^level, so the newest level pays best. `killValueScale` lifts all levels alike. */
  killValueScale: 1,
  killValueGrowth: 1.45,
  /** Research cost: base × depthGrowth^(path length from the start) × size factor × progressGrowth^(nodes owned). */
  costBase: 15,
  costDepthGrowth: 1.2,
  costProgressGrowth: 1.01,
  /**
   * Cohesion of the stream (#40): 0 = blobs move independently and run through each other, 1 = a blob moves at the mean pace
   * of the 3 × 3 cells around it. Blobs also keep closer to the middle of a cell (lane × (1 − 0.6 × cohesion)).
   */
  cohesion: 0.8,
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
