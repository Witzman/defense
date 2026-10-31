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
  /** Where the streams come from. */
  spawns: Point[];
  /** What they flow to; each has its own energy. */
  goals: Point[];
}

export function cellAt(map: Pick<GameMap, "width" | "height" | "cells">, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return LAND;
  return map.cells[y * map.width + x]!;
}

export interface MapParams {
  width: number;
  height: number;
  seed: number;
  /** Spawns on the left edge (default 1). */
  spawns?: number;
  /** Goals on the right edge (default 1). */
  goals?: number;
  /** Rivers carved from each spawn, each in its own lane (default 3). */
  paths?: number;
  /** River width in cells (default 3). */
  riverWidth?: number;
  /** Share of the map turned into open lakes by noise, 0–0.5 (default 0.1). */
  openness?: number;
  /** Chance per river stretch to narrow into a choke point (default 0.3). */
  chokes?: number;
}

/**
 * A lake for the level: rivers from every spawn (left edge) to the goals (right edge) — main routes plus one
 * detour — then open water from noise, small islands inside it, and every pocket the goals cannot reach filled.
 * The rivers' centre lines are kept as water, so the spawns always reach a goal.
 */
export function generateMap(params: MapParams): GameMap {
  const { width, height, seed } = params;
  const nSpawns = params.spawns ?? 1;
  const nGoals = params.goals ?? 1;
  const nPaths = params.paths ?? 3;
  const riverWidth = params.riverWidth ?? 3;
  const openness = params.openness ?? 0.1;
  const chokes = params.chokes ?? 0.3;
  const rng = createRng(seed);
  const cells = new Uint8Array(width * height).fill(LAND);
  const core = new Uint8Array(width * height);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] = v;
  };

  const edgePoints = (n: number, x: number): Point[] =>
    Array.from({ length: n }, (_, i) => ({ x, y: Math.round(((i + 1) / (n + 1)) * (height - 1) + rng.range(-1, 1)) }));
  const spawns = edgePoints(nSpawns, 0);
  const goals = edgePoints(nGoals, width - 1);

  /**
   * A meandering river from a to b, carved `w` wide, its centre marked as core. "part" turns diagonal at once
   * (routes leaving one spawn separate quickly); "meet" runs straight first and turns only at the end (routes
   * reaching one goal join as late as possible).
   */
  function river(a: Point, b: Point, w: number, mode: "part" | "meet" = "part") {
    let { x, y } = a;
    let choke = 0;
    const steps: Point[] = [];
    let guard = 0;
    while ((x !== b.x || y !== b.y) && guard++ < width * height) {
      const dx = b.x - x;
      const dy = b.y - y;
      // Diagonal while both gaps are open (routes from one spawn part at once), else along the larger gap,
      // with a random sideways wobble.
      const px = x;
      const py = y;
      const diagonal = mode === "part" ? rng.next() < 0.55 : Math.abs(dx) <= Math.abs(dy);
      if (dx !== 0 && dy !== 0 && diagonal) {
        x += Math.sign(dx);
        y += Math.sign(dy);
      } else if (Math.abs(dx) >= Math.abs(dy) ? rng.next() < 0.8 : rng.next() < 0.3) {
        x += Math.sign(dx);
        if (rng.next() < 0.25) y += rng.next() < 0.5 ? 1 : -1;
      } else y += Math.sign(dy) || (rng.next() < 0.5 ? 1 : -1);
      y = Math.max(0, Math.min(height - 1, y));
      x = Math.max(0, Math.min(width - 1, x));
      // Keep the centre line edge-connected: enemies never cut a land corner, so a diagonal-only step
      // would be a wall in a one-cell choke.
      if (x !== px && y !== py) steps.push({ x, y: py });
      steps.push({ x, y });
    }
    steps.forEach((p, i) => {
      // A choke point narrows a stretch to one cell, away from both ends.
      if (choke === 0 && i % 10 === 0 && i > 6 && i < steps.length - 6 && rng.next() < chokes) choke = 3 + rng.int(3);
      const r = choke > 0 ? 0 : Math.floor((w - 1) / 2) + (w % 2 === 0 && rng.next() < 0.5 ? 1 : 0);
      if (choke > 0) choke--;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (ox * ox + oy * oy <= r * r + r) set(p.x + ox, p.y + oy, WATER);
      core[p.y * width + p.x] = 1;
    });
  }

  // Lanes: every route gets its own horizontal band, ordered top to bottom over all spawns, and heads for the
  // goal in its share of the right edge. Ordered lanes never cross, so blocking one route leaves the others.
  const lanes = nSpawns * nPaths;
  spawns.forEach((s, si) => {
    for (let j = 0; j < nPaths; j++) {
      const lane = si * nPaths + j;
      const band = (lane + 1) / (lanes + 1);
      const goal = goals[Math.min(goals.length - 1, Math.floor((lane / lanes) * goals.length))]!;
      const w1 = { x: Math.round(width * rng.range(0.25, 0.35)), y: clampY(height * band + rng.range(-1.5, 1.5)) };
      const w2 = { x: Math.round(width * rng.range(0.6, 0.72)), y: clampY(height * band + rng.range(-1.5, 1.5)) };
      river(s, w1, riverWidth);
      river(w1, w2, riverWidth);
      river(w2, goal, riverWidth, "meet");
    }
  });

  function clampY(y: number) {
    return Math.max(1, Math.min(height - 2, Math.round(y)));
  }

  // Open water grows with the level; small islands stay inside it so there is something to build on.
  if (openness > 0) {
    const lakes = valueNoise(width, height, Math.max(5, width / 9), rng);
    const t = quantile(lakes, 1 - openness);
    for (let i = 0; i < cells.length; i++) if (lakes[i]! > t) cells[i] = WATER;
    const isles = valueNoise(width, height, 2.5, rng);
    const ti = quantile(isles, 0.82);
    for (let i = 0; i < cells.length; i++) if (cells[i] === WATER && !core[i] && lakes[i]! > t && isles[i]! > ti) cells[i] = LAND;
  }

  // A basin around every spawn and goal: routes part and meet in open water, not in one shared channel.
  const basin = 3 + riverWidth / 2;
  for (const p of [...spawns, ...goals])
    for (let oy = -Math.ceil(basin); oy <= basin; oy++)
      for (let ox = -Math.ceil(basin); ox <= basin; ox++) if (ox * ox + oy * oy <= basin * basin) set(p.x + ox, p.y + oy, WATER);
  // Water the goals cannot reach would hold enemies forever: fill it.
  const field = distanceField({ width, height, cells }, goals);
  for (let i = 0; i < cells.length; i++) if (cells[i] === WATER && field[i] === UNREACHABLE) cells[i] = LAND;

  return { width, height, cells, spawns, goals };
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
