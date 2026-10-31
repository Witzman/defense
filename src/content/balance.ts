/**
 * The curves balancing turns (#9). Every number here is checked by the balancing simulation
 * (`npm run balance`, report in balance/report.md); change them there, not where they are used.
 */
export const BALANCE = {
  /** Hit points per enemy: base × growth^level, times the type's own hit points. */
  hpBase: 6,
  hpGrowth: 1.3,
  /** Research points per kill: growth^level, so the newest level pays best. */
  killValueGrowth: 1.45,
  /** Research cost: base × depthGrowth^(path length from the start) × size factor × progressGrowth^(nodes owned). */
  costBase: 15,
  costDepthGrowth: 1.2,
  costProgressGrowth: 1.01,
  /** Seconds the taps of a level run: base + perLevel × level. */
  spawnSecondsBase: 70,
  spawnSecondsPerLevel: 4,
};
