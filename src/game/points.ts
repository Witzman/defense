import { BALANCE } from "../content/balance.ts";

/**
 * Research points for one run (#5):
 *
 *   points = valuePerKill(level) × killed × (1 + killed / total)
 *
 * Absolute kills and the share both count; there is no bonus for time or "efficiency". A kill is worth more on a
 * later level, so the highest level reached is normally the best place to earn.
 */
export function runPoints(levelIndex: number, killed: number, total: number): number {
  if (killed <= 0 || total <= 0) return 0;
  return Math.round(valuePerKill(levelIndex) * killed * (1 + killed / total));
}

export function valuePerKill(levelIndex: number): number {
  return BALANCE.killValueGrowth ** levelIndex * (BALANCE.levelKillValue[levelIndex] ?? 1);
}
