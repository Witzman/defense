/** How a turret's facing follows the fingers and the tool buttons (#25, #41). Degrees throughout. */

/** Turning snaps to this step. */
export const FACING_STEP = 15;
const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Facing after turning `base` by `rot` radians (clockwise on screen), snapped, in 0..359. */
export function turnedFacing(base: number, rot: number): number {
  const f = snap(base + (rot * 180) / Math.PI, FACING_STEP);
  return ((f % 360) + 360) % 360;
}

/** Facing for a turret at a land cell (#41): towards the water around it, so a narrow arc starts on the stream. */
export function facingToWater(cells: ArrayLike<number>, width: number, height: number, x: number, y: number, water: number, reach = 4): number {
  let sx = 0;
  let sy = 0;
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= width || cy >= height || cells[cy * width + cx] !== water) continue;
      // Near water counts more than far.
      const w = 1 / (1 + dx * dx + dy * dy);
      sx += dx * w;
      sy += dy * w;
    }
  if (sx === 0 && sy === 0) return 0;
  return turnedFacing(0, Math.atan2(sy, sx));
}
