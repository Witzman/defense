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
 * The map as an atlas sheet (#16): paper land with beach, meadow and forest in OpenStreetMap colours; water shaded
 * from shallow to deep with the depth lines of a sea chart; a blue coastline. Drawn once per level.
 */
export function drawTerrain(map: GameMap, field: Field): HTMLCanvasElement {
  const S = Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (map.width * map.height)));
  const c = document.createElement("canvas");
  c.width = Math.ceil(map.width * S);
  c.height = Math.ceil(map.height * S);
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  const px = img.data;
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
  for (let y = 0; y < c.height; y++) {
    const cy = (y + 0.5) / S;
    for (let x = 0; x < c.width; x++) {
      const cx = (x + 0.5) / S;
      const v = field(cx, cy) + wobble(cx, cy);
      if (v > 0) {
        const t = Math.min(1, v / 4);
        put(MAP.water);
        blend(MAP.waterDeep, t);
        for (const d of DEPTHS) {
          const a = 1 - Math.abs(v - d) / depthPx;
          if (a > 0) blend(MAP.depthLine, 0.35 * Math.min(1, a));
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
      const grain = (hash(x, y) - 0.5) * MAP.grain;
      const o = (y * c.width + x) * 4;
      px[o] = out[0]! + grain;
      px[o + 1] = out[1]! + grain;
      px[o + 2] = out[2]! + grain;
      px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Forest symbols, as OpenStreetMap draws woodland: small triangles on a staggered grid.
  g.fillStyle = MAP.forestInk;
  const step = Math.max(0.45, 10 / S);
  const r = Math.min(3.5, S * 0.14);
  for (let j = 0, cy = step / 2; cy < map.height; j++, cy += step)
    for (let cx = step / 2 + (j % 2) * (step / 2); cx < map.width; cx += step) {
      if (field(cx, cy) > -1.1 || noise(cx * 0.35 + 40, cy * 0.35) <= 0.58) continue;
      const x = cx * S;
      const y = cy * S;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.86, y + r * 0.6);
      g.lineTo(x - r * 0.86, y + r * 0.6);
      g.closePath();
      g.fill();
    }
  return c;
}

/** Colour of the paper around the map. */
export const PAPER = css(MAP.land);
