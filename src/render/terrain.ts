import { LAND, cellAt, type GameMap } from "../sim/map.ts";
import { MAP, css, type Rgb } from "./theme.ts";

/** Distance in cells to the nearest cell edge between land and water: positive in water, negative on land. */
export type Field = (x: number, y: number) => number;

/**
 * Signed distance to the shore, sampled between cell centres. Outside the map counts as land (cellAt), so the
 * lake is framed by shore. Chamfer distance on the cell grid, half a cell taken off so the zero line is the cell edge.
 */
export function shoreField(map: GameMap): Field {
  const W = map.width + 2;
  const H = map.height + 2;
  const land = (i: number) => cellAt(map, (i % W) - 1, Math.floor(i / W) - 1) === LAND;
  const toLand = chamfer(W, H, (i) => land(i));
  const toWater = chamfer(W, H, (i) => !land(i));
  const f = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) f[i] = land(i) ? -(toWater[i]! - 0.5) : toLand[i]! - 0.5;
  return (x, y) => {
    // Padded grid: cell (0, 0) of the map is at (1, 1); centres sit at +0.5.
    const gx = Math.max(0, Math.min(W - 1.001, x + 0.5));
    const gy = Math.max(0, Math.min(H - 1.001, y + 0.5));
    // Catmull-Rom between cell centres: the shore comes out round, not as the octagons a linear blend draws.
    const xi = Math.floor(gx);
    const yi = Math.floor(gy);
    const wx = cubic(gx - xi);
    const wy = cubic(gy - yi);
    let v = 0;
    for (let j = 0; j < 4; j++) {
      const row = Math.max(0, Math.min(H - 1, yi + j - 1)) * W;
      let r = 0;
      for (let i = 0; i < 4; i++) r += f[row + Math.max(0, Math.min(W - 1, xi + i - 1))]! * wx[i]!;
      v += r * wy[j]!;
    }
    return v;
  };
}

/** Catmull-Rom weights of the four samples around a point `t` of the way from the second to the third. */
function cubic(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

function chamfer(W: number, H: number, target: (i: number) => boolean): Float32Array {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = target(i) ? 0 : 1e9;
  const r2 = Math.SQRT2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i]!;
      if (x > 0) v = Math.min(v, d[i - 1]! + 1);
      if (y > 0) v = Math.min(v, d[i - W]! + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - W - 1]! + r2);
      if (x < W - 1 && y > 0) v = Math.min(v, d[i - W + 1]! + r2);
      d[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i]!;
      if (x < W - 1) v = Math.min(v, d[i + 1]! + 1);
      if (y < H - 1) v = Math.min(v, d[i + W]! + 1);
      if (x < W - 1 && y < H - 1) v = Math.min(v, d[i + W + 1]! + r2);
      if (x > 0 && y < H - 1) v = Math.min(v, d[i + W - 1]! + r2);
      d[i] = v;
    }
  return d;
}

function hash(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

/** Smooth value noise, 0..1. */
export function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * How far the drawn shore may reach into a water cell, in cells. The hand-drawn wobble of the coast stays within it,
 * and the enemy mass is cut off before it (fluid.ts): the mass never covers an island (#11).
 */
export const LAND_REACH = 0.12;

/** Coast wobble: a hand-drawn line, never further out than LAND_REACH. */
export function wobble(x: number, y: number): number {
  return (noise(x * 0.9, y * 0.9) - 0.5) * 2 * (LAND_REACH - 0.02);
}

/** Pixels the terrain image may have: the largest maps get fewer pixels per cell, drawing stays well under a second. */
const PIXEL_BUDGET = 2_500_000;
const MAX_SCALE = 24;

const DEPTHS = [0.9, 1.9, 3.2];

/**
 * Paints rows [rowFrom, rowTo) of a piece of the map sheet into `img`: pixel (px, py) shows map point
 * (x0 + (px + 0.5) / S, y0 + (py + 0.5) / S). The whole sheet and the sharp detail of a zoomed view (TerrainDetail)
 * are painted by the same rules, so they line up.
 */
function paintRows(img: ImageData, field: Field, x0: number, y0: number, S: number, rowFrom: number, rowTo: number) {
  const px = img.data;
  const W = img.width;
  const coastPx = 0.9 / S;
  const depthPx = 0.55 / S;
  const out: number[] = [0, 0, 0];
  const put = (rgb: Rgb) => {
    out[0] = rgb[0];
    out[1] = rgb[1];
    out[2] = rgb[2];
  };
  const blend = (rgb: Rgb, a: number) => {
    out[0]! += (rgb[0] - out[0]!) * a;
    out[1]! += (rgb[1] - out[1]!) * a;
    out[2]! += (rgb[2] - out[2]!) * a;
  };
  for (let y = rowFrom; y < rowTo; y++) {
    const cy = y0 + (y + 0.5) / S;
    for (let x = 0; x < W; x++) {
      const cx = x0 + (x + 0.5) / S;
      const v = field(cx, cy) + wobble(cx, cy);
      if (v > 0) {
        const t = Math.min(1, v / 4);
        put(MAP.water);
        blend(MAP.waterDeep, t);
        for (const d of DEPTHS) {
          const a = 1 - Math.abs(v - d) / depthPx;
          if (a > 0) blend(MAP.depthLine, MAP.depthAlpha * Math.min(1, a));
        }
      } else {
        const inland = -v;
        const n = noise(cx * 0.35 + 40, cy * 0.35);
        if (inland < 0.45) put(MAP.sand);
        else if (n > 0.55 && inland > 0.9) put(MAP.forest);
        else if (n < 0.35 && inland > 0.7) put(MAP.meadow);
        else put(MAP.land);
      }
      const a = 1 - Math.abs(v) / coastPx;
      if (a > 0) blend(MAP.coast, 0.95 * Math.min(1, a));
      // Halo of the coast, into the water only: the shore glows, the land stays dark.
      else if (v > 0 && v < 0.6) blend(MAP.coast, MAP.coastGlow * (1 - v / 0.6) ** 2);
      // Grain is tied to the map point, not the pixel, so sheet and detail share it.
      const grain = (hash(Math.floor(cx * 24), Math.floor(cy * 24)) - 0.5) * MAP.grain;
      const o = (y * W + x) * 4;
      px[o] = out[0]! + grain;
      px[o + 1] = out[1]! + grain;
      px[o + 2] = out[2]! + grain;
      px[o + 3] = 255;
    }
  }
}

/** Distance between forest symbols, in cells. */
const TREE_STEP = 0.6;

/**
 * Symbols on top of the painted sheet, as OpenStreetMap draws them: woodland as small triangles on a staggered grid,
 * footpaths as dashed lines over the land. Map units throughout, so sheet and detail show the same.
 */
function decorate(g: CanvasRenderingContext2D, map: GameMap, field: Field, x0: number, y0: number, S: number, w: number, h: number) {
  const x1 = x0 + w / S;
  const y1 = y0 + h / S;
  g.fillStyle = MAP.forestInk;
  const r = Math.min(7, S * 0.15);
  const j0 = Math.max(0, Math.floor(y0 / TREE_STEP) - 1);
  for (let j = j0, cy = (j0 + 0.5) * TREE_STEP; cy < Math.min(map.height, y1 + 1); j++, cy += TREE_STEP) {
    const shift = (j % 2) * (TREE_STEP / 2);
    const i0 = Math.max(0, Math.floor((x0 - shift) / TREE_STEP) - 1);
    for (let cx = (i0 + 0.5) * TREE_STEP + shift; cx < Math.min(map.width, x1 + 1); cx += TREE_STEP) {
      if (field(cx, cy) > -1.1 || noise(cx * 0.35 + 40, cy * 0.35) <= 0.58) continue;
      const x = (cx - x0) * S;
      const y = (cy - y0) * S;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.86, y + r * 0.6);
      g.lineTo(x - r * 0.86, y + r * 0.6);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = MAP.path;
  g.lineWidth = Math.max(1, S * 0.06);
  g.lineCap = "round";
  g.setLineDash([Math.max(2, S * 0.2), Math.max(2, S * 0.16)]);
  for (const path of footpaths(map, field)) {
    g.beginPath();
    for (const p of path) g.lineTo((p.x - x0) * S, (p.y - y0) * S);
    g.stroke();
  }
  g.setLineDash([]);
}

const pathCache = new WeakMap<GameMap, { x: number; y: number }[][]>();

/** Footpaths: walks over the inland of larger land, deterministic per map. */
export function footpaths(map: GameMap, field: Field): { x: number; y: number }[][] {
  const cached = pathCache.get(map);
  if (cached) return cached;
  const paths: { x: number; y: number }[][] = [];
  const count = Math.round((map.width * map.height) / 400);
  for (let k = 0; k < count * 4 && paths.length < count; k++) {
    let x = hash(k, 7) * map.width;
    let y = hash(7, k) * map.height;
    if (field(x, y) > -1.6) continue;
    let a = hash(k, k) * Math.PI * 2;
    const path = [{ x, y }];
    for (let s = 0; s < 60; s++) {
      a += (hash(k, s) - 0.5) * 0.7;
      const nx = x + Math.cos(a) * 0.5;
      const ny = y + Math.sin(a) * 0.5;
      // Paths keep off the beach: they turn away where the land ends.
      if (field(nx, ny) > -0.9) {
        a += 1.4;
        continue;
      }
      x = nx;
      y = ny;
      path.push({ x, y });
    }
    if (path.length > 12) paths.push(path);
  }
  pathCache.set(map, paths);
  return paths;
}

/**
 * The map as an atlas sheet at night (#16, #26, #18): dark land with beach, meadow, woodland and footpaths; water
 * shaded from shallow to deep with a hint of the depth lines of a sea chart; a glowing coastline. Drawn once per level.
 */
export function drawTerrain(map: GameMap, field: Field): HTMLCanvasElement {
  const S = sheetScale(map);
  const c = document.createElement("canvas");
  c.width = Math.ceil(map.width * S);
  c.height = Math.ceil(map.height * S);
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  paintRows(img, field, 0, 0, S, 0, c.height);
  g.putImageData(img, 0, 0);
  decorate(g, map, field, 0, 0, S, c.width, c.height);
  return c;
}

/** Pixels the sharp detail of a zoomed view may have, and the time per frame it may take to paint them. */
const DETAIL_BUDGET = 1_600_000;
const DETAIL_MS = 4;
/** The detail is painted once the camera is this much closer than the sheet. */
const DETAIL_FROM = 1.4;

interface DetailPiece {
  canvas: HTMLCanvasElement;
  img: ImageData;
  x0: number;
  y0: number;
  S: number;
  key: string;
  row: number;
}

/**
 * Keeps the map sharp up close (#18): when the camera is well closer than the sheet, the visible part is painted again
 * at the camera's resolution, a few rows per frame so the frame rate holds; until it is done the sheet shows.
 */
export class TerrainDetail {
  private map: GameMap;
  private field: Field;
  private sheetScale: number;
  private shown?: DetailPiece;
  private job?: DetailPiece;

  constructor(map: GameMap, field: Field, sheetScale: number) {
    this.map = map;
    this.field = field;
    this.sheetScale = sheetScale;
  }

  /** Advance the painting for the camera `view` on a canvas of cw × ch pixels, then draw what is done. */
  draw(g: CanvasRenderingContext2D, view: { scale: number; ox: number; oy: number }) {
    const { scale: s, ox, oy } = view;
    if (s > this.sheetScale * DETAIL_FROM) this.work(g.canvas.width, g.canvas.height, s, ox, oy);
    else this.job = undefined;
    const d = this.shown;
    if (!d || s <= this.sheetScale * DETAIL_FROM) return;
    g.imageSmoothingEnabled = true;
    g.drawImage(d.canvas, ox + d.x0 * s, oy + d.y0 * s, (d.canvas.width / d.S) * s, (d.canvas.height / d.S) * s);
  }

  private work(cw: number, ch: number, s: number, ox: number, oy: number) {
    const { width: W, height: H } = this.map;
    const x0 = Math.max(0, Math.floor(-ox / s) - 1);
    const y0 = Math.max(0, Math.floor(-oy / s) - 1);
    const x1 = Math.min(W, Math.ceil((cw - ox) / s) + 1);
    const y1 = Math.min(H, Math.ceil((ch - oy) / s) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    const S = Math.min(s, Math.sqrt(DETAIL_BUDGET / ((x1 - x0) * (y1 - y0))));
    if (S <= this.sheetScale * 1.1) return;
    // A new view starts a new piece; the camera standing still lets it finish.
    const key = `${x0},${y0},${x1},${y1},${Math.round(S)}`;
    if (this.shown?.key === key) return;
    if (this.job?.key !== key) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil((x1 - x0) * S);
      canvas.height = Math.ceil((y1 - y0) * S);
      const img = canvas.getContext("2d")!.createImageData(canvas.width, canvas.height);
      this.job = { canvas, img, x0, y0, S, key, row: 0 };
    }
    const job = this.job;
    const until = performance.now() + DETAIL_MS;
    while (job.row < job.img.height && performance.now() < until) {
      const to = Math.min(job.img.height, job.row + 8);
      paintRows(job.img, this.field, job.x0, job.y0, job.S, job.row, to);
      job.row = to;
    }
    if (job.row < job.img.height) return;
    const g = job.canvas.getContext("2d")!;
    g.putImageData(job.img, 0, 0);
    decorate(g, this.map, this.field, job.x0, job.y0, job.S, job.canvas.width, job.canvas.height);
    this.shown = job;
    this.job = undefined;
  }
}

/** Pixels per cell of the sheet drawTerrain paints for a map. */
export function sheetScale(map: GameMap): number {
  return Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (map.width * map.height)));
}

/** Colour of the land around the map. */
export const PAPER = css(MAP.land);
