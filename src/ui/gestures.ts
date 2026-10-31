/**
 * One input model for mouse and touch (#15): one pointer drags (pans) or taps, two pointers pinch (zoom and pan),
 * a mouse without a button hovers. Positions are CSS pixels relative to the element.
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

export interface GestureHandlers {
  move(m: Move): void;
  tap(p: Pt, ev: PointerEvent): void;
  /** Mouse position without a pressed button; undefined when it leaves. Touch never hovers. */
  hover?(p: Pt | undefined): void;
}

/** Movement in CSS pixels below which a press is still a tap. Fingers wobble more than mice. */
const TAP_SLOP = { mouse: 5, touch: 12 };

/** The move that keeps the two fingers on the same content as they go from (a0, b0) to (a1, b1). */
export function pinchMove(a0: Pt, b0: Pt, a1: Pt, b1: Pt): Move {
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  return { k: d0 > 0 && d1 > 0 ? d1 / d0 : 1, cx: m1.x, cy: m1.y, dx: m1.x - m0.x, dy: m1.y - m0.y };
}

/** Applies a move to a camera with screen = world * scale + offset. */
export function applyMove<V extends { scale: number; ox: number; oy: number }>(v: V, m: Move, min: number, max: number): V {
  const ox = v.ox + m.dx;
  const oy = v.oy + m.dy;
  const scale = Math.min(max, Math.max(min, v.scale * m.k));
  const k = scale / v.scale;
  return { ...v, scale, ox: m.cx - (m.cx - ox) * k, oy: m.cy - (m.cy - oy) * k };
}

export function attachGestures(el: HTMLElement, h: GestureHandlers) {
  const down = new Map<number, Pt>();
  let start: Pt | undefined;
  /** A press that moved past the slop or ever had a second finger is no tap. */
  let tapping = false;
  const at = (ev: PointerEvent): Pt => {
    const r = el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  el.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    el.setPointerCapture?.(ev.pointerId);
    const p = at(ev);
    down.set(ev.pointerId, p);
    if (down.size === 1) {
      start = p;
      tapping = true;
    } else tapping = false;
    if (ev.pointerType !== "mouse") h.hover?.(undefined);
  });
  el.addEventListener("pointermove", (ev) => {
    const p = at(ev);
    const prev = down.get(ev.pointerId);
    if (!prev) {
      if (ev.pointerType === "mouse") h.hover?.(p);
      return;
    }
    if (down.size === 1) {
      const slop = ev.pointerType === "mouse" ? TAP_SLOP.mouse : TAP_SLOP.touch;
      if (tapping && start && Math.hypot(p.x - start.x, p.y - start.y) > slop) {
        tapping = false;
        h.move({ k: 1, cx: 0, cy: 0, dx: p.x - start.x, dy: p.y - start.y });
      } else if (!tapping) h.move({ k: 1, cx: 0, cy: 0, dx: p.x - prev.x, dy: p.y - prev.y });
      else if (ev.pointerType === "mouse") h.hover?.(p);
      down.set(ev.pointerId, p);
      return;
    }
    const [idA, idB] = [...down.keys()] as [number, number];
    const a0 = down.get(idA)!;
    const b0 = down.get(idB)!;
    down.set(ev.pointerId, p);
    if (ev.pointerId !== idA && ev.pointerId !== idB) return;
    h.move(pinchMove(a0, b0, down.get(idA)!, down.get(idB)!));
  });
  const end = (ev: PointerEvent) => {
    if (!down.delete(ev.pointerId)) return;
    if (down.size === 0) {
      if (tapping && ev.type === "pointerup") h.tap(at(ev), ev);
      tapping = false;
      start = undefined;
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("pointerleave", (ev) => {
    if (ev.pointerType === "mouse" && !down.has(ev.pointerId)) h.hover?.(undefined);
  });
}
