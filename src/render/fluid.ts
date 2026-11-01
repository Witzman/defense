import type { World } from "../sim/world.ts";
import { ENEMY_TYPES } from "../content/enemies.ts";
import { LAND_REACH, type Field } from "./terrain.ts";

const RGB = new Map(ENEMY_TYPES.map((t) => [t.id, hexToRgb(t.color)] as const));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pixels the mass may be computed on per frame: the visible part of the map, finer the closer the camera. */
const BUDGET = 200_000;
/** Density at which the mass has its surface: one blob alone is a drop of about 0.45 cells, neighbours merge. */
const SURFACE = 0.35;
/** Pixels per cell above which every blob gets a highlight. */
export const HIGHLIGHT_SCALE = 12;

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  k: number;
}

/**
 * The enemy mass as one liquid (#16): every blob adds a soft drop to a density field, the field gets a sharp surface
 * at SURFACE and a halo below it, both in the colours of the types inside. Computed on the CPU at a few pixels per
 * cell over the visible part only (no canvas filter: Safari lacks it), then scaled up with smoothing. Cut off where
 * the shore begins, so the mass never covers an island (#11).
 */
export class Fluid {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private image?: ImageData;
  private acc = new Float32Array(0);
  private mask = new Float32Array(0);
  private maskKey = "";

  private field: Field;
  private width: number;
  private height: number;

  constructor(field: Field, width: number, height: number) {
    this.field = field;
    this.width = width;
    this.height = height;
  }

  draw(g: CanvasRenderingContext2D, w: World, view: { scale: number; ox: number; oy: number }, alpha: number) {
    const { scale: s, ox, oy } = view;
    const r = this.region(g.canvas.width, g.canvas.height, s, ox, oy);
    if (!r) return;
    const cols = (r.x1 - r.x0) * r.k;
    const rows = (r.y1 - r.y0) * r.k;
    const n = cols * rows;
    if (!this.image || this.image.width !== cols || this.image.height !== rows) {
      this.canvas.width = cols;
      this.canvas.height = rows;
      this.image = this.ctx.createImageData(cols, rows);
    }
    if (this.acc.length < n * 4) this.acc = new Float32Array(n * 4);
    this.updateMask(r, cols, rows);
    const acc = this.acc;
    acc.fill(0, 0, n * 4);
    const k = r.k;
    for (const e of w.enemies) {
      const x = (e.px + (e.x - e.px) * alpha - r.x0) * k;
      const y = (e.py + (e.y - e.py) * alpha - r.y0) * k;
      // A packet of many is a bigger drop than one enemy.
      const R = 0.68 * Math.min(1.6, 0.8 + Math.log10(e.size + 1) * 0.3) * k;
      const xa = Math.max(0, Math.floor(x - R));
      const xb = Math.min(cols - 1, Math.ceil(x + R));
      const ya = Math.max(0, Math.floor(y - R));
      const yb = Math.min(rows - 1, Math.ceil(y + R));
      if (xa > xb || ya > yb) continue;
      const [cr, cg, cb] = RGB.get(e.type)!;
      const inv = 1 / (R * R);
      for (let py = ya; py <= yb; py++) {
        const dy = py + 0.5 - y;
        for (let px = xa; px <= xb; px++) {
          const dx = px + 0.5 - x;
          const q = 1 - (dx * dx + dy * dy) * inv;
          if (q <= 0) continue;
          const wt = q * q;
          const i = (py * cols + px) * 4;
          acc[i]! += cr * wt;
          acc[i + 1]! += cg * wt;
          acc[i + 2]! += cb * wt;
          acc[i + 3]! += wt;
        }
      }
    }
    const data = this.image.data;
    const mask = this.mask;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const d = acc[o + 3]!;
      const m = mask[i]!;
      if (d < 0.04 || m <= 0) {
        data[o + 3] = 0;
        continue;
      }
      const core = smooth(SURFACE - 0.06, SURFACE + 0.06, d);
      const halo = smooth(0.04, SURFACE, d) * 0.5;
      const a = core + halo * (1 - core);
      // The surface shines brighter where the mass is fuller; the halo is a pale glow around it.
      const lift = core * (0.08 + 0.2 * Math.min(1, d - SURFACE)) + (1 - core) * 0.4;
      const inv = 1 / d;
      data[o] = acc[o]! * inv + (255 - acc[o]! * inv) * lift;
      data[o + 1] = acc[o + 1]! * inv + (255 - acc[o + 1]! * inv) * lift;
      data[o + 2] = acc[o + 2]! * inv + (255 - acc[o + 2]! * inv) * lift;
      data[o + 3] = 255 * a * m;
    }
    this.ctx.putImageData(this.image, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.canvas, ox + r.x0 * s, oy + r.y0 * s, (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);

    // Up close every blob catches the light: a small highlight, so single members stay countable.
    if (s >= HIGHLIGHT_SCALE) {
      const hr = Math.max(1, s * 0.07);
      g.fillStyle = "rgba(255, 255, 255, 0.75)";
      g.beginPath();
      for (const e of w.enemies) {
        const x = e.px + (e.x - e.px) * alpha;
        const y = e.py + (e.y - e.py) * alpha;
        if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
        const sx = ox + x * s - s * 0.08;
        const sy = oy + y * s - s * 0.08;
        g.moveTo(sx + hr, sy);
        g.arc(sx, sy, hr, 0, Math.PI * 2);
      }
      g.fill();
    }
  }

  /** The visible cells plus a margin for drops reaching in, and the resolution the budget allows for them. */
  private region(cw: number, ch: number, s: number, ox: number, oy: number): Region | undefined {
    const x0 = Math.max(0, Math.floor(-ox / s) - 1);
    const y0 = Math.max(0, Math.floor(-oy / s) - 1);
    const x1 = Math.min(this.width, Math.ceil((cw - ox) / s) + 1);
    const y1 = Math.min(this.height, Math.ceil((ch - oy) / s) + 1);
    if (x1 <= x0 || y1 <= y0) return undefined;
    const k = Math.max(2, Math.min(16, Math.ceil(s), Math.floor(Math.sqrt(BUDGET / ((x1 - x0) * (y1 - y0))))));
    return { x0, y0, x1, y1, k };
  }

  /** Water mask of the region, recomputed only when the region or its resolution changes. */
  private updateMask(r: Region, cols: number, rows: number) {
    const key = `${r.x0},${r.y0},${r.x1},${r.y1},${r.k}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    if (this.mask.length < cols * rows) this.mask = new Float32Array(cols * rows);
    for (let py = 0; py < rows; py++)
      for (let px = 0; px < cols; px++) {
        const v = this.field(r.x0 + (px + 0.5) / r.k, r.y0 + (py + 0.5) / r.k);
        this.mask[py * cols + px] = Math.min(1, Math.max(0, (v - LAND_REACH) / 0.08));
      }
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
