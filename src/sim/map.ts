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

/**
 * Shape of the map (#17): channel networks — a warped grid, a scatter of nodes, one long snake with shortcuts — or
 * "blocks": open water with thick walls (bars, L and U shapes) and gaps between them (owner's references).
 */
export type Layout = "grid" | "organic" | "serpentine" | "blocks";

export interface MapParams {
  width: number;
  height: number;
  seed: number;
  /** Spawns (default 1), on the outer edge of the map, far from the goals. */
  spawns?: number;
  /** Goals (default 1), on the outer edge of the map (owner, #17). */
  goals?: number;
  /** Shape of the network (default "grid"). */
  layout?: Layout;
  /** Share of network nodes widened into lakes, 0–1 (default 0). Combines with every layout. */
  lakes?: number;
  /** Mean distance between network nodes in cells (default 9). */
  spacing?: number;
  /** Width of the main arms — the shortest routes from spawns to goals — in cells (default 4). */
  mainWidth?: number;
  /** Width of every other channel in cells (default 2.2). */
  sideWidth?: number;
  /** Share of the channels beyond the maze's spanning tree kept as loops, 0–1 (default 0.3). */
  loops?: number;
  /** Chance that a main arm narrows to a choke point in its middle (default 0.3). */
  chokes?: number;
  /**
   * Every spawn must keep a way to a goal when its main route is blocked wide, and that way must be at least this
   * much longer (default 1: any way). Open maps have many ways of nearly equal length (owner's references, #17).
   */
  minDetour?: number;
}

/** Radius around the main route that the detour check blocks, and the radius around spawns and goals it leaves open. */
export function detourBlock(mainWidth: number) {
  return { radius: Math.max(4, Math.ceil(mainWidth / 2) + 1), endRadius: 9 };
}

/**
 * A labyrinth of channels over the whole map (#17): network nodes joined as a maze, plus loops so there is never
 * only one way, the shortest routes from the spawns carved wide as main arms, chokes on them, optional lakes.
 * Spawns and goals sit on the map's edge, far apart. A map without a way around a blocked main arm
 * is redrawn from a derived seed with more loops, so the result is the same for the same seed.
 */
export function generateMap(params: MapParams): GameMap {
  const minDetour = params.minDetour ?? 1;
  let best: { map: GameMap; detour: number } | undefined;
  for (let attempt = 0; attempt < 24; attempt++) {
    const map = draw(params, params.seed + attempt * 104_729, Math.min(0.9, (params.loops ?? 0.3) + attempt * 0.05));
    const detour = worstDetour(map, params.mainWidth ?? 4);
    if (detour > 0 && detour >= minDetour) return map;
    if (!best || detour > best.detour) best = { map, detour };
  }
  return best!.map;
}

/** The smallest detour factor over all spawns: blocked route length over free route length; 0 if one is cut off. */
export function worstDetour(map: GameMap, mainWidth: number): number {
  const { radius, endRadius } = detourBlock(mainWidth);
  // Blocking less can leave a shorter detour inside a wide arm: check the narrow block too.
  return Math.min(detourAt(map, radius, endRadius), detourAt(map, 4, endRadius));
}

function detourAt(map: GameMap, radius: number, endRadius: number): number {
  const field = distanceField(map, map.goals);
  let worst = Infinity;
  for (const s of map.spawns) {
    const free = field[s.y * map.width + s.x]!;
    if (free === UNREACHABLE) return 0;
    const cells = map.cells.slice();
    for (const p of descend(map, field, s)) {
      if ([s, ...map.goals].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < endRadius)) continue;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = p.x + dx;
          const y = p.y + dy;
          if (dx * dx + dy * dy <= radius * radius && x >= 0 && y >= 0 && x < map.width && y < map.height) cells[y * map.width + x] = LAND;
        }
    }
    const blocked = distanceField({ ...map, cells }, map.goals)[s.y * map.width + s.x]!;
    worst = Math.min(worst, blocked === UNREACHABLE ? 0 : blocked / free);
  }
  return worst;
}

/** Cells of the cheapest route from p down the field to a goal. */
export function descend(map: Pick<GameMap, "width" | "height">, field: Float64Array, p: Point): Point[] {
  const out: Point[] = [p];
  let cur = p;
  for (let guard = 0; guard < map.width * map.height; guard++) {
    const here = field[cur.y * map.width + cur.x]!;
    if (here === 0) break;
    let next = cur;
    let low = here;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cur.x + dx;
        const y = cur.y + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const d = field[y * map.width + x]!;
        if (d < low) [next, low] = [{ x, y }, d];
      }
    if (next === cur) break;
    cur = next;
    out.push(cur);
  }
  return out;
}

type Edge = [number, number];

function draw(params: MapParams, seed: number, loops: number): GameMap {
  if (params.layout === "blocks") return drawBlocks(params, seed, loops);
  const { width, height } = params;
  const rng = createRng(seed);
  const spacing = params.spacing ?? 9;
  const mainWidth = params.mainWidth ?? 4;
  const sideWidth = params.sideWidth ?? 2.2;
  const chokes = params.chokes ?? 0.3;
  const cells = new Uint8Array(width * height).fill(LAND);

  const stamp = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (x >= 0 && y >= 0 && x < width && y < height && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) cells[y * width + x] = WATER;
  };

  const { nodes, fixed, candidates, spare } = layoutNodes(params.layout ?? "grid", width, height, spacing, rng);
  const edges = maze(nodes.length, fixed, candidates, spare, loops, rng);

  // Spawns and goals: nodes on the rim, spawns far from every goal and apart; each opens to the map's edge.
  const rim = nodes.map((_, i) => i).filter((i) => {
    const p = nodes[i]!;
    return p.x < spacing || p.y < spacing || p.x > width - 1 - spacing || p.y > height - 1 - spacing;
  });
  const dist = (a: number, b: number) => Math.hypot(nodes[a]!.x - nodes[b]!.x, nodes[a]!.y - nodes[b]!.y);
  const goals: number[] = [];
  const nGoals = params.goals ?? 1;
  goals.push(rim[rng.int(rim.length)]!);
  while (goals.length < nGoals) goals.push(farthest(rim.filter((i) => !goals.includes(i)), (i) => Math.min(...goals.map((g) => dist(i, g)))));
  const far = Math.max(width, height) * 0.4;
  const spawns: number[] = [];
  const nSpawns = params.spawns ?? 1;
  const toGoal = (i: number) => Math.min(...goals.map((g) => dist(i, g)));
  while (spawns.length < nSpawns) {
    const open = rim.filter((i) => !goals.includes(i) && !spawns.includes(i));
    const pool = open.filter((i) => toGoal(i) >= far);
    if (spawns.length === 0 && pool.length > 0) spawns.push(pool[rng.int(pool.length)]!);
    else spawns.push(farthest(pool.length > 0 ? pool : open, (i) => Math.min(toGoal(i), ...spawns.map((s) => dist(i, s) * 1.2))));
  }

  // Main arms: each spawn's shortest way through the network to its nearest goal.
  const main = new Set<number>();
  for (const s of spawns) for (const k of shortestEdges(nodes, edges, s, goals)) main.add(k);

  edges.forEach(([a, b], k) => {
    const pts = meander(nodes[a]!, nodes[b]!, spacing * 0.12, rng);
    const isMain = main.has(k);
    const choke = isMain && rng.next() < chokes;
    const w = isMain ? mainWidth : sideWidth + rng.range(0, 0.6);
    carve(pts, (t) => (choke && t > 0.4 && t < 0.6 ? Math.max(2, sideWidth) : w), stamp);
  });
  const lakes = params.lakes ?? 0;
  for (let i = 0; i < nodes.length; i++) {
    if (rng.next() >= lakes) continue;
    const r = spacing * rng.range(0.22, 0.38);
    for (let k = 0; k < 6; k++) stamp(nodes[i]!.x + rng.range(-0.6, 0.6) * r, nodes[i]!.y + rng.range(-0.5, 0.5) * r, r * rng.range(0.55, 0.9));
  }
  // Spawns and goals sit on the map's edge: a main-width channel runs from their node straight out to the nearest side.
  const edgePoint = (i: number): Point => {
    const p = nodes[i]!;
    const sides = [
      { d: p.x, at: { x: 0, y: p.y } },
      { d: width - 1 - p.x, at: { x: width - 1, y: p.y } },
      { d: p.y, at: { x: p.x, y: 0 } },
      { d: height - 1 - p.y, at: { x: p.x, y: height - 1 } },
    ];
    const at = sides.reduce((b, s) => (s.d < b.d ? s : b)).at;
    return { x: Math.max(0, Math.min(width - 1, Math.floor(at.x))), y: Math.max(0, Math.min(height - 1, Math.floor(at.y))) };
  };
  const ends = [...spawns, ...goals].map((i) => {
    const e = edgePoint(i);
    const mouth = { x: e.x + 0.5, y: e.y + 0.5 };
    // Two channels into the network, so even the mouth has a way around.
    const second = nodes.map((p, j) => [Math.hypot(p.x - mouth.x, p.y - mouth.y), j] as const).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0])[0]![1];
    carve([nodes[i]!, mouth], () => mainWidth, stamp);
    carve(meander(mouth, nodes[second]!, spacing * 0.12, rng), () => sideWidth + 0.4, stamp);
    // A basin at the mouth: streams leave and arrive in open water.
    stamp(e.x + 0.5, e.y + 0.5, mainWidth / 2 + 1.5);
    cells[e.y * width + e.x] = WATER;
    return e;
  });
  const map: GameMap = { width, height, cells, spawns: ends.slice(0, spawns.length), goals: ends.slice(spawns.length) };
  // Water the goals cannot reach would hold enemies forever: fill it.
  const field = distanceField(map, map.goals);
  for (let i = 0; i < cells.length; i++) if (cells[i] === WATER && field[i] === UNREACHABLE) cells[i] = LAND;
  return map;
}

/**
 * Open water with walls: on a coarse grid, cells take a bar, an L, a U or a block of land, thick and angular, with
 * gaps to their neighbours; `loops` sets how many cells stay open. Spawns and goals sit on the edge, far apart.
 */
function drawBlocks(params: MapParams, seed: number, loops: number): GameMap {
  const { width, height } = params;
  const rng = createRng(seed);
  const spacing = (params.spacing ?? 9) * 1.9;
  const cells = new Uint8Array(width * height).fill(WATER);
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, Math.round(Math.min(y0, y1))); y < Math.min(height, Math.round(Math.max(y0, y1))); y++)
      for (let x = Math.max(0, Math.round(Math.min(x0, x1))); x < Math.min(width, Math.round(Math.max(x0, x1))); x++) cells[y * width + x] = LAND;
  };
  const cols = Math.max(3, Math.round(width / spacing));
  const rows = Math.max(2, Math.round(height / spacing));
  const cw = width / cols;
  const ch = height / rows;
  const gap = Math.max(2.5, (params.sideWidth ?? 2.2) * 0.9);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (rng.next() < loops * 0.4) continue; // a few cells stay open: plazas where streams meet
      // The piece fills its cell up to a gap on every side; thickness of a wall about a third of the cell.
      const x0 = c * cw + gap / 2, x1 = (c + 1) * cw - gap / 2, y0 = r * ch + gap / 2, y1 = (r + 1) * ch - gap / 2;
      const t = Math.max(2.5, Math.min(cw, ch) * rng.range(0.24, 0.34));
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const kind = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5][rng.int(11)]!; // mostly bars, L and U; a solid block now and then
      if (kind === 0) rect(x0, my - t / 2, x1 + (rng.next() < 0.4 ? gap : 0), my + t / 2); // bar, sometimes joined to the next cell
      else if (kind === 1) rect(mx - t / 2, y0, mx + t / 2, y1 + (rng.next() < 0.4 ? gap : 0));
      else if (kind === 2) { rect(x0, y0, x1, y0 + t); rect(x0, y0, x0 + t, y1); } // L
      else if (kind === 3) { rect(x0, y1 - t, x1, y1); rect(x1 - t, y0, x1, y1); }
      else if (kind === 4) { rect(x0, y0, x0 + t, y1); rect(x0, y1 - t, x1, y1); rect(x1 - t, y0, x1, y1); } // U
      else rect(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2, x1 - (x1 - x0) * 0.2, y1 - (y1 - y0) * 0.2); // block
    }

  // Spawns and goals on the edge: goals first, spawns far from them and apart.
  const edge: Point[] = [];
  for (let x = 2; x < width - 2; x += 3) edge.push({ x, y: 0 }, { x, y: height - 1 });
  for (let y = 2; y < height - 2; y += 3) edge.push({ x: 0, y }, { x: width - 1, y });
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const goals: Point[] = [edge[rng.int(edge.length)]!];
  while (goals.length < (params.goals ?? 1)) goals.push(edge.reduce((b, p) => (Math.min(...goals.map((g) => d(p, g))) > Math.min(...goals.map((g) => d(b, g))) ? p : b)));
  const far = Math.max(width, height) * 0.4;
  const spawns: Point[] = [];
  while (spawns.length < (params.spawns ?? 1)) {
    const toGoal = (p: Point) => Math.min(...goals.map((g) => d(p, g)));
    const pool = edge.filter((p) => toGoal(p) >= far && !spawns.includes(p));
    if (spawns.length === 0 && pool.length > 0) spawns.push(pool[rng.int(pool.length)]!);
    else spawns.push((pool.length > 0 ? pool : edge).reduce((b, p) => (Math.min(toGoal(p), ...spawns.map((s) => d(p, s) * 1.2)) > Math.min(toGoal(b), ...spawns.map((s) => d(b, s) * 1.2)) ? p : b)));
  }
  // Open water at every mouth.
  const r = (params.mainWidth ?? 4) / 2 + 2;
  for (const p of [...spawns, ...goals])
    for (let y = Math.floor(p.y - r); y <= p.y + r; y++)
      for (let x = Math.floor(p.x - r); x <= p.x + r; x++) if (x >= 0 && y >= 0 && x < width && y < height && (x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) cells[y * width + x] = WATER;
  const map: GameMap = { width, height, cells, spawns, goals };
  const field = distanceField(map, goals);
  for (let i = 0; i < cells.length; i++) if (cells[i] === WATER && field[i] === UNREACHABLE) cells[i] = LAND;
  return map;
}

function farthest(pool: number[], score: (i: number) => number): number {
  return pool.reduce((b, i) => (score(i) > score(b) ? i : b), pool[0]!);
}

/** Node positions and the channels between them: `fixed` always stays, `candidates` make the maze and its loops. */
function layoutNodes(layout: Layout, width: number, height: number, spacing: number, rng: Rng) {
  const nodes: Point[] = [];
  const fixed: Edge[] = [];
  const candidates: Edge[] = [];
  /** Edges used only where the maze could not join a node otherwise. */
  const spare: Edge[] = [];
  const m = 3;
  if (layout === "organic") {
    const want = Math.max(6, Math.round(((width - 2 * m) * (height - 2 * m)) / (spacing * spacing)));
    for (let t = 0; t < want * 80 && nodes.length < want; t++) {
      const p = { x: rng.range(m, width - m), y: rng.range(m, height - m) };
      if (nodes.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > spacing * 0.8)) nodes.push(p);
    }
    nodes.forEach((p, i) => {
      const near = nodes.map((q, j) => [Math.hypot(q.x - p.x, q.y - p.y), j] as const).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]);
      for (const [, j] of near.slice(0, 4)) if (!candidates.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) candidates.push([i, j]);
    });
  } else {
    const cols = Math.max(3, Math.round((width - 2 * m) / spacing));
    const rows = Math.max(2, Math.round((height - 2 * m) / spacing));
    const cw = (width - 2 * m) / cols;
    const ch = (height - 2 * m) / rows;
    const jitter = layout === "grid" ? 0.5 : 0.25;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        nodes.push({ x: m + (c + 0.5 + rng.range(-jitter, jitter) / 2) * cw, y: m + (r + 0.5 + rng.range(-jitter, jitter) / 2) * ch });
    const at = (r: number, c: number) => r * cols + c;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (layout === "serpentine") {
          // The snake: every row end to end, rows joined at alternating sides; everything else is a shortcut.
          if (c + 1 < cols) fixed.push([at(r, c), at(r, c + 1)]);
          if (r + 1 < rows) (c === (r % 2 === 0 ? cols - 1 : 0) ? fixed : candidates).push([at(r, c), at(r + 1, c)]);
        } else {
          // A closed ring along the border would be the shortest way for every rim spawn: break most of it.
          const rimRow = r === 0 || r === rows - 1;
          const rimCol = c === 0 || c === cols - 1;
          if (c + 1 < cols) (!rimRow || rng.next() < 0.4 ? candidates : spare).push([at(r, c), at(r, c + 1)]);
          if (r + 1 < rows) (!rimCol || rng.next() < 0.4 ? candidates : spare).push([at(r, c), at(r + 1, c)]);
        }
      }
  }
  return { nodes, fixed, candidates, spare };
}

/**
 * Spanning tree (fixed edges first, then candidates in random order, spare edges only where nothing else joins)
 * plus a share of the remaining candidates as loops.
 */
function maze(n: number, fixed: Edge[], candidates: Edge[], spare: Edge[], loops: number, rng: Rng): Edge[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const shuffled = candidates.map((e) => [rng.next(), e] as const).sort((a, b) => a[0] - b[0]).map(([, e]) => e);
  const tree: Edge[] = [];
  const rest: Edge[] = [];
  for (const e of [...fixed, ...shuffled, ...spare]) {
    const a = find(e[0]);
    const b = find(e[1]);
    if (a !== b) {
      parent[a] = b;
      tree.push(e);
    } else if (fixed.includes(e)) tree.push(e);
    else if (!spare.includes(e)) rest.push(e);
  }
  return [...tree, ...rest.slice(0, Math.round(rest.length * loops))];
}

/** Edges of the shortest way through the network from `from` to the nearest of `targets`. */
function shortestEdges(nodes: Point[], edges: Edge[], from: number, targets: number[]): number[] {
  const adj: [number, number, number][][] = nodes.map(() => []);
  edges.forEach(([a, b], k) => {
    const l = Math.hypot(nodes[a]!.x - nodes[b]!.x, nodes[a]!.y - nodes[b]!.y);
    adj[a]!.push([b, l, k]);
    adj[b]!.push([a, l, k]);
  });
  const d = nodes.map(() => Infinity);
  const via = nodes.map(() => -1);
  d[from] = 0;
  const open = new Set([from]);
  while (open.size > 0) {
    let u = -1;
    for (const i of open) if (u < 0 || d[i]! < d[u]!) u = i;
    open.delete(u);
    for (const [v, l, k] of adj[u]!) if (d[u]! + l < d[v]!) [d[v], via[v]] = [d[u]! + l, k], open.add(v);
  }
  let v = targets.reduce((b, t) => (d[t]! < d[b]! ? t : b), targets[0]!);
  const out: number[] = [];
  while (v !== from && via[v]! >= 0) {
    out.push(via[v]!);
    const [a, b] = edges[via[v]!]!;
    v = a === v ? b : a;
  }
  return out;
}

/** A wavy line from a to b: a sine meander plus smoothed noise across the chord, calm at both ends. */
function meander(a: Point, b: Point, amp: number, rng: Rng): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.max(4, Math.round(len));
  const phase = rng.range(0, Math.PI * 2);
  const waves = rng.range(0.5, 1.5);
  let noise = 0;
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    noise = noise * 0.8 + rng.range(-0.5, 0.5) * amp * 0.6;
    const o = (Math.sin(t * waves * Math.PI * 2 + phase) * amp + noise) * Math.sin(Math.PI * t);
    out.push({ x: a.x + dx * t + nx * o, y: a.y + dy * t + ny * o });
  }
  return out;
}

/** Carves a polyline with a width that may change along it (t from 0 to 1). */
function carve(pts: Point[], width: (t: number) => number, stamp: (x: number, y: number, r: number) => void) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3));
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      stamp(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, width((i - 1 + f) / (pts.length - 1)) / 2);
    }
  }
}
