/** Small pure rules behind the bar and the tool column, kept out of main.ts so they can be tested. */

/**
 * The count on a turret slot (#35): how many more may stand. With plenty left only that number — "1/95" was noise;
 * the total shows once it starts to matter.
 */
export function slotCount(used: number, capacity: number): string {
  const free = Math.max(0, capacity - used);
  return free <= 9 ? `${free}/${capacity}` : String(free);
}

/** Real seconds one frame may count at most: a slow device or a hidden tab falls behind instead of spiralling. */
export const MAX_FRAME_SECONDS = 0.25;

/**
 * How many fixed simulation steps of `dt` this frame runs (#33). `acc` is game time not yet stepped, `elapsed` the
 * real seconds since the last frame, `rate` game seconds per real second (the pace times 1× or 2×). Paused, nothing
 * runs and nothing builds up. Faster only means more of the same steps, so a run plays out the same at every speed.
 */
export function frameSteps(acc: number, elapsed: number, rate: number, paused: boolean, dt: number): { steps: number; acc: number } {
  if (paused) return { steps: 0, acc };
  const total = acc + Math.min(MAX_FRAME_SECONDS, Math.max(0, elapsed)) * rate;
  // The epsilon keeps a sum that should be a whole number of steps from losing one to rounding.
  const steps = Math.floor(total / dt + 1e-9);
  return { steps, acc: Math.max(0, total - steps * dt) };
}

/** Run speeds the speed button toggles between. */
export const SPEEDS = [1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
export const nextSpeed = (s: Speed): Speed => (s === 1 ? 2 : 1);
export const parseSpeed = (stored: string | null): Speed => (stored === "2" ? 2 : 1);
