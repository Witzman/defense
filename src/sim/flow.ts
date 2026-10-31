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

/** Path length over water from every cell to the target (Dijkstra, 8 neighbours, no corner cutting). */
export function distanceField(map: Grid, target: Point): Float64Array {
  const { width } = map;
  const dist = new Float64Array(map.cells.length).fill(UNREACHABLE);
  if (!water(map, target.x, target.y)) return dist;
  const heap = new MinHeap();
  const start = target.y * width + target.x;
  dist[start] = 0;
  heap.push(start, 0);
  while (heap.size > 0) {
    const [i, d] = heap.pop();
    if (d > dist[i]!) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy, cost] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!water(map, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && !(water(map, x + dx, y) && water(map, x, y + dy))) continue;
      const j = ny * width + nx;
      const nd = d + cost;
      if (nd < dist[j]!) {
        dist[j] = nd;
        heap.push(j, nd);
      }
    }
  }
  return dist;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.ids[0]!, this.keys[0]!];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.ids.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}
