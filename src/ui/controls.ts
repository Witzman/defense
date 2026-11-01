/** Small pure rules behind the bar and the tool column, kept out of main.ts so they can be tested. */

/**
 * The count on a turret slot (#35): how many more may stand. With plenty left only that number — "1/95" was noise;
 * the total shows once it starts to matter.
 */
export function slotCount(used: number, capacity: number): string {
  const free = Math.max(0, capacity - used);
  return free <= 9 ? `${free}/${capacity}` : String(free);
}
