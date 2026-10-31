import { createRng, type Rng } from "./rng.ts";
import { distanceField, UNREACHABLE } from "./flow.ts";

export const WATER = 0;
export const LAND = 1;

export interface Point {
  x: number;
  y: number;
}

/** A grid of cells: water is where enemies flow, land is where turrets stand. */
export interface GameMap {
  width: number;
  height: number;
  cells: Uint8Array;
  spawn: Point;
  goal: Point;
}

export interface MapParams {
  width: number;
  height: number;
  seed: number;
}

export function cellAt(map: Pick<GameMap, "width" | "height" | "cells">, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return LAND;
  return map.cells[y * map.width + x]!;
}

/** Islands from smoothed noise, plus one guaranteed meandering channel from spawn (left) to goal (right). */
export function generateMap({ width, height, seed }: MapParams): GameMap {
  const rng = createRng(seed);
  const noise = valueNoise(width, height, 4.5, rng);
  const threshold = quantile(noise, 0.5);
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) cells[i] = noise[i]! > threshold ? LAND : WATER;

  const spawn = { x: 0, y: Math.floor(height / 3 + rng.int(Math.floor(height / 3))) };
  const goal = { x: width - 1, y: Math.floor(height / 3 + rng.int(Math.floor(height / 3))) };
  carveChannel(cells, width, height, spawn, goal, rng);

  // Water the goal cannot reach would hold enemies forever: fill it.
  const field = distanceField({ width, height, cells }, goal);
  for (let i = 0; i < cells.length; i++) if (cells[i] === WATER && field[i] === UNREACHABLE) cells[i] = LAND;

  return { width, height, cells, spawn, goal };
}

function carveChannel(cells: Uint8Array, width: number, height: number, from: Point, to: Point, rng: Rng) {
  let y = from.y;
  for (let x = 0; x < width; x++) {
    const remaining = width - 1 - x;
    const drift = remaining > 0 ? (to.y - y) / remaining : 0;
    y += Math.round(drift + rng.range(-1, 1));
    y = Math.max(1, Math.min(height - 2, y));
    if (remaining === 0) y = to.y;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = Math.max(0, Math.min(height - 1, y + dy));
      cells[yy * width + x] = WATER;
      if (x + 1 < width) cells[yy * width + x + 1] = WATER;
    }
  }
  cells[from.y * width + from.x] = WATER;
  cells[to.y * width + to.x] = WATER;
}

function valueNoise(width: number, height: number, scale: number, rng: Rng): Float64Array {
  const gw = Math.ceil(width / scale) + 2;
  const gh = Math.ceil(height / scale) + 2;
  const grid = Float64Array.from({ length: gw * gh }, () => rng.next());
  const out = new Float64Array(width * height);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const g = (ix: number, iy: number) => grid[iy * gw + ix]!;
      const top = g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx;
      const bottom = g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx;
      out[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

function quantile(values: Float64Array, q: number): number {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor(q * (sorted.length - 1))]!;
}
