/**
 * One input model for mouse and touch (#15): one pointer drags (pans) or taps, two pointers pinch (zoom and pan),
 * a mouse without a button hovers. Positions are CSS pixels relative to the element.
 *
 * Touch can also grab a thing on the map (#25): a press the page accepts in `grab` (or one held still for HOLD_MS that
 * the page accepts in `hold`) turns dragging into `drag`, and a second finger into `twist` — the pinch and turn of
 * that thing instead of the camera. Two fingers that land around a grabbable thing (`grab2`) twist it as well.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Pan by (dx, dy), then zoom by `k` around (cx, cy). */
export interface Move {
  k: number;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
}

/** Two fingers on a grabbed thing, since they went down: spread `k` (1 = unchanged), turn `rot` (radians, clockwise on screen). */
export interface Twist {
  k: number;
  rot: number;
}

export interface GestureHandlers {
  move(m: Move): void;
  /** A press without movement. `count` is 2 for the second tap of a quick double tap at the same place. */
  tap(p: Pt, ev: PointerEvent, count: number): void;
  /** Mouse position without a pressed button; undefined when it leaves. Touch never hovers. */
  hover?(p: Pt | undefined): void;
  /** A touch goes down at p: true grabs what is there at once (dragging moves it, not the camera). */
  grab?(p: Pt): boolean;
  /** A touch held still at p for HOLD_MS: true grabs what is there. */
  hold?(p: Pt): boolean;
  /** Two touches go down around mid: true grabs what is there for a twist. */
  grab2?(mid: Pt): boolean;
  drag?(p: Pt): void;
  twist?(t: Twist): void;
  /** The grab ends (all fingers up or cancelled). */
  release?(): void;
}

/** Movement in CSS pixels below which a press is still a tap. Fingers wobble more than mice. */
export const TAP_SLOP = { mouse: 5, touch: 12 };
/** A touch held this long without moving past the slop is a hold. */
export const HOLD_MS = 350;
/** Two taps within this time and distance are a double tap. */
export const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DIST = 30;

/** The move that keeps the two fingers on the same content as they go from (a0, b0) to (a1, b1). */
export function pinchMove(a0: Pt, b0: Pt, a1: Pt, b1: Pt): Move {
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  return { k: d0 > 0 && d1 > 0 ? d1 / d0 : 1, cx: m1.x, cy: m1.y, dx: m1.x - m0.x, dy: m1.y - m0.y };
}

/** Spread and turn of two fingers going from (a0, b0) to (a1, b1). */
export function twistOf(a0: Pt, b0: Pt, a1: Pt, b1: Pt): Twist {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  let rot = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  while (rot > Math.PI) rot -= 2 * Math.PI;
  while (rot < -Math.PI) rot += 2 * Math.PI;
  return { k: d0 > 0 && d1 > 0 ? d1 / d0 : 1, rot };
}

/** Applies a move to a camera with screen = world * scale + offset. */
export function applyMove<V extends { scale: number; ox: number; oy: number }>(v: V, m: Move, min: number, max: number): V {
  const ox = v.ox + m.dx;
  const oy = v.oy + m.dy;
  const scale = Math.min(max, Math.max(min, v.scale * m.k));
  const k = scale / v.scale;
  return { ...v, scale, ox: m.cx - (m.cx - ox) * k, oy: m.cy - (m.cy - oy) * k };
}

/** What attachGestures needs of an element; an HTMLElement has it. */
export interface GestureTarget {
  addEventListener(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "pointerleave", fn: (ev: PointerEvent) => void): void;
  getBoundingClientRect(): { left: number; top: number };
  setPointerCapture?(id: number): void;
}

export function attachGestures(el: GestureTarget, h: GestureHandlers) {
  const down = new Map<number, Pt>();
  let start: Pt | undefined;
  /** A press that moved past the slop or ever had a second finger is no tap. */
  let tapping = false;
  /** What the fingers act on: the camera, or a grabbed thing (drag with one finger, twist with two). */
  let grabbed = false;
  /** Where the two fingers of a twist went down. */
  let twistFrom: [Pt, Pt] | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTap: { p: Pt; t: number } | undefined;
  const at = (ev: PointerEvent): Pt => {
    const r = el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const stopHold = () => {
    clearTimeout(holdTimer);
    holdTimer = undefined;
  };

  el.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    el.setPointerCapture?.(ev.pointerId);
    const p = at(ev);
    down.set(ev.pointerId, p);
    const touch = ev.pointerType !== "mouse";
    if (down.size === 1) {
      start = p;
      tapping = true;
      grabbed = touch && (h.grab?.(p) ?? false);
      stopHold();
      if (touch && !grabbed && h.hold) {
        const hold = h.hold;
        holdTimer = setTimeout(() => {
          holdTimer = undefined;
          if (tapping && down.size === 1 && hold(p)) {
            grabbed = true;
            tapping = false;
          }
        }, HOLD_MS);
      }
    } else {
      tapping = false;
      stopHold();
      if (down.size === 2 && touch) {
        const [a, b] = [...down.values()] as [Pt, Pt];
        if (!grabbed) grabbed = h.grab2?.({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) ?? false;
        if (grabbed) twistFrom = [a, b];
      }
    }
    if (touch) h.hover?.(undefined);
  });
  el.addEventListener("pointermove", (ev) => {
    const p = at(ev);
    const prev = down.get(ev.pointerId);
    if (!prev) {
      if (ev.pointerType === "mouse") h.hover?.(p);
      return;
    }
    if (down.size === 1) {
      if (twistFrom) return; // one finger of a twist lifted: the other one does nothing until all are up
      const slop = ev.pointerType === "mouse" ? TAP_SLOP.mouse : TAP_SLOP.touch;
      if (tapping && start && Math.hypot(p.x - start.x, p.y - start.y) > slop) {
        tapping = false;
        stopHold();
        if (grabbed) h.drag?.(p);
        else h.move({ k: 1, cx: 0, cy: 0, dx: p.x - start.x, dy: p.y - start.y });
      } else if (!tapping) {
        if (grabbed) h.drag?.(p);
        else h.move({ k: 1, cx: 0, cy: 0, dx: p.x - prev.x, dy: p.y - prev.y });
      } else if (ev.pointerType === "mouse") h.hover?.(p);
      down.set(ev.pointerId, p);
      return;
    }
    const [idA, idB] = [...down.keys()] as [number, number];
    const a0 = down.get(idA)!;
    const b0 = down.get(idB)!;
    down.set(ev.pointerId, p);
    if (ev.pointerId !== idA && ev.pointerId !== idB) return;
    if (twistFrom) h.twist?.(twistOf(twistFrom[0], twistFrom[1], down.get(idA)!, down.get(idB)!));
    else if (!grabbed) h.move(pinchMove(a0, b0, down.get(idA)!, down.get(idB)!));
  });
  const end = (ev: PointerEvent) => {
    if (!down.delete(ev.pointerId)) return;
    stopHold();
    if (down.size > 0) return;
    if (tapping && ev.type === "pointerup") {
      const p = at(ev);
      const double = !!lastTap && ev.timeStamp - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < DOUBLE_TAP_DIST;
      lastTap = double ? undefined : { p, t: ev.timeStamp };
      h.tap(p, ev, double ? 2 : 1);
    } else lastTap = undefined;
    if (grabbed) h.release?.();
    grabbed = false;
    twistFrom = undefined;
    tapping = false;
    start = undefined;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("pointerleave", (ev) => {
    if (ev.pointerType === "mouse" && !down.has(ev.pointerId)) h.hover?.(undefined);
  });
}
