import { WATER, type GameMap, type Point } from "./map.ts";

export const UNREACHABLE = Infinity;

const STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

type Grid = Pick<GameMap, "width" | "height" | "cells">;

function water(map: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] === WATER;
}

const DX = STEPS.map((s) => s[0]);
const DY = STEPS.map((s) => s[1]);
const LEN = STEPS.map((s) => s[2]);

/** 1 where the cell is water. Read once per field instead of bounds and cell checks per step. */
function waterMask(map: Grid): Uint8Array {
  const mask = new Uint8Array(map.cells.length);
  for (let i = 0; i < mask.length; i++) mask[i] = map.cells[i] === WATER ? 1 : 0;
  return mask;
}

/**
 * Path cost over water from every cell to the nearest target (Dijkstra, 8 neighbours, no corner cutting).
 * Without `cellCost` the cost is the path length; with it, a step costs its length times the mean of both cells' cost.
 */
export function distanceField(map: Grid, targets: readonly Point[], cellCost?: Float32Array): Float64Array {
  const { width, height } = map;
  const wet = waterMask(map);
  const dist = new Float64Array(map.cells.length).fill(UNREACHABLE);
  const heap = new MinHeap(map.cells.length);
  // Several targets: every cell measures to the cheapest one.
  for (const target of targets) {
    if (!water(map, target.x, target.y)) continue;
    const start = target.y * width + target.x;
    dist[start] = 0;
    heap.push(start, 0);
  }
  while (heap.size > 0) {
    const i = heap.popId();
    const d = heap.poppedKey;
    if (d > dist[i]!) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (let k = 0; k < 8; k++) {
      const dx = DX[k]!;
      const dy = DY[k]!;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (!wet[j]) continue;
      // A diagonal needs water on both sides; both lie inside the map when the diagonal cell does.
      if (dx !== 0 && dy !== 0 && !(wet[y * width + nx] && wet[ny * width + x])) continue;
      const cost = LEN[k]!;
      const nd = d + (cellCost ? (cost * (cellCost[i]! + cellCost[j]!)) / 2 : cost);
      if (nd < dist[j]!) {
        dist[j] = nd;
        heap.push(j, nd);
      }
    }
  }
  return dist;
}

/**
 * Depth of the water (#27): per water cell the distance from its centre to the centre of the nearest land cell
 * (8 neighbours, diagonal √2); outside the map counts as land, as in `cellAt`. A cell on the shore is 1, land is 0.
 * Depends on the map only, so a world computes it once.
 */
export function depthField(map: Grid): Float64Array {
  const { width, height } = map;
  const wet = waterMask(map);
  const depth = new Float64Array(map.cells.length);
  const heap = new MinHeap(map.cells.length);
  const wetAt = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && wet[y * width + x] === 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!wet[i]) continue;
      let d = Infinity;
      for (let k = 0; k < 8; k++) if (LEN[k]! < d && !wetAt(x + DX[k]!, y + DY[k]!)) d = LEN[k]!;
      depth[i] = d;
      if (d < Infinity) heap.push(i, d);
    }
  while (heap.size > 0) {
    const i = heap.popId();
    const d = heap.poppedKey;
    if (d > depth[i]!) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k]!;
      const ny = y + DY[k]!;
      if (!wetAt(nx, ny)) continue;
      const j = ny * width + nx;
      const nd = d + LEN[k]!;
      if (nd < depth[j]!) {
        depth[j] = nd;
        heap.push(j, nd);
      }
    }
  }
  return depth;
}

/** Binary min-heap of (id, key) on typed arrays; grows when lazy deletion leaves stale entries. */
class MinHeap {
  private ids: Int32Array;
  private keys: Float64Array;
  size = 0;
  /** Key of the entry `popId` returned last. */
  poppedKey = 0;
  constructor(capacity: number) {
    this.ids = new Int32Array(Math.max(16, capacity));
    this.keys = new Float64Array(Math.max(16, capacity));
  }
  push(id: number, key: number) {
    if (this.size === this.ids.length) this.grow();
    const ids = this.ids;
    const keys = this.keys;
    let i = this.size++;
    // Sift up: the same comparisons and moves as a swap-based heap, so the pop order is unchanged.
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      ids[i] = ids[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  popId(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0]!;
    this.poppedKey = keys[0]!;
    const n = --this.size;
    if (n > 0) {
      const id = ids[n]!;
      const key = keys[n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = key;
        if (l < n && keys[l]! < mk) {
          m = l;
          mk = keys[l]!;
        }
        if (r < n && keys[r]! < mk) m = r;
        if (m === i) break;
        ids[i] = ids[m]!;
        keys[i] = keys[m]!;
        i = m;
      }
      ids[i] = id;
      keys[i] = key;
    }
    return top;
  }
  private grow() {
    const ids = new Int32Array(this.ids.length * 2);
    ids.set(this.ids);
    const keys = new Float64Array(this.keys.length * 2);
    keys.set(this.keys);
    this.ids = ids;
    this.keys = keys;
  }
}
