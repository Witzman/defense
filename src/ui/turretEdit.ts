/** How a turret's facing and swivel arc follow the fingers and the tool buttons (#25). Degrees throughout. */

/** Turning snaps to this step. */
export const FACING_STEP = 15;
/** The swivel arc snaps to this step and stays within MIN_ARC..360. */
export const ARC_STEP = 15;
export const MIN_ARC = 30;
/** The stops of the arc button (and key A), widest first. */
export const ARCS = [360, 180, 120, 90, 60];

const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Facing after turning `base` by `rot` radians (clockwise on screen), snapped, in 0..359. */
export function turnedFacing(base: number, rot: number): number {
  const f = snap(base + (rot * 180) / Math.PI, FACING_STEP);
  return ((f % 360) + 360) % 360;
}

/** Swivel arc after spreading the fingers by `k` (2 = twice as far apart = twice as wide), snapped and bounded. */
export function spreadArc(base: number, k: number): number {
  return Math.min(360, Math.max(MIN_ARC, snap(base * k, ARC_STEP)));
}

/** The next narrower stop of the arc button; from the narrowest (or below it) back to 360. */
export function nextArc(arc: number): number {
  return ARCS.find((a) => a < arc) ?? 360;
}
