import { LAND, cellAt, type GameMap } from "../sim/map.ts";
import { createRng } from "../sim/rng.ts";
import type { Field } from "./terrain.ts";

/** A name on the map, in map cells (#18): islands in small capitals, waters in italics, harbours and springs. */
export interface Label {
  text: string;
  x: number;
  y: number;
  kind: "island" | "water" | "place";
}

const ISLANDS = ["Kiefernwerder", "Hohe Insel", "Sandbank", "Möwenwerder", "Schilfinsel", "Eichholm", "Reiherwerder", "Lange Insel", "Fuchsholm", "Krähenwerder", "Birkenholm", "Steinwerder"];
const WATERS = ["Großer Arm", "Untere Rinne", "Schilfbucht", "Alte Fahrt", "Tiefer Grund", "Krumme Lanke", "Stille Bucht", "Nebenarm", "Fährrinne", "Breites Wasser", "Kolk", "Mühlenarm"];

/** Smallest island (cells) that gets a name. */
const MIN_ISLAND = 6;
/** Labels of one kind keep at least this many cells apart. */
const SPACING = 12;

/**
 * Names for the islands and waters of a map, the same for every visit to a level (seeded from the map). Islands are
 * land not touching the map edge (the edge is shore, not an island); each is named at its most inland point. Waters
 * are named at their deepest points, as many as the map's size allows.
 */
export function mapLabels(map: GameMap, field: Field, seed: number): Label[] {
  const rng = createRng(seed);
  const pickNames = (pool: readonly string[]) => {
    const names = [...pool];
    for (let i = names.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [names[i], names[j]] = [names[j]!, names[i]!];
    }
    return names;
  };
  const labels: Label[] = [];
  const { width: W, height: H } = map;

  // Islands: 4-connected land components that stay off the edge.
  const seen = new Uint8Array(W * H);
  const islands: { x: number; y: number; size: number }[] = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || map.cells[start] !== LAND) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    let edge = false;
    let best = { x: 0, y: 0, v: Infinity };
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      size++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      const v = field(x + 0.5, y + 0.5);
      if (v < best.v) best = { x: x + 0.5, y: y + 0.5, v };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!seen[j] && map.cells[j] === LAND) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (!edge && size >= MIN_ISLAND) islands.push({ x: best.x, y: best.y, size });
  }
  islands.sort((a, b) => b.size - a.size);
  const islandNames = pickNames(ISLANDS);
  for (const isl of islands) {
    if (labels.length >= islandNames.length) break;
    if (labels.some((l) => Math.hypot(l.x - isl.x, l.y - isl.y) < SPACING)) continue;
    labels.push({ text: islandNames[labels.length]!, x: isl.x, y: isl.y, kind: "island" });
  }

  // Waters: the deepest points, spread out.
  const deep: { x: number; y: number; v: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (cellAt(map, x, y) !== LAND) deep.push({ x: x + 0.5, y: y + 0.5, v: field(x + 0.5, y + 0.5) });
  deep.sort((a, b) => b.v - a.v);
  const count = Math.max(2, Math.min(6, Math.round((W * H) / 900)));
  const waterNames = pickNames(WATERS);
  const waters: Label[] = [];
  const marks = [...map.spawns, ...map.goals].map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  for (const d of deep) {
    if (waters.length >= count) break;
    if (d.v < 1.2) break;
    if ([...waters, ...marks].some((l) => Math.hypot(l.x - d.x, l.y - d.y) < SPACING)) continue;
    waters.push({ text: waterNames[waters.length]!, x: d.x, y: d.y, kind: "water" });
  }
  labels.push(...waters);

  // Places: harbours at the goals, springs at the spawns – beside the marker, towards the map's middle.
  const place = (p: { x: number; y: number }, text: string) => {
    const x = p.x + 0.5 + (p.x > W / 2 ? -3 : 3);
    const y = p.y + 0.5 + (p.y > H / 2 ? -1.6 : 1.6);
    labels.push({ text, x, y, kind: "place" });
  };
  map.goals.forEach((g, i) => place(g, map.goals.length > 1 ? `Hafen ${i + 1}` : "Hafen"));
  map.spawns.forEach((s, i) => place(s, map.spawns.length > 1 ? `Quelle ${i + 1}` : "Quelle"));
  return labels;
}

/** An axis-aligned box in screen pixels. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A label to place: its wanted centre and its text box size, in screen pixels. */
export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a label ended up: its centre, or hidden. */
export interface Placed {
  x: number;
  y: number;
  visible: boolean;
}

/** Tried in this order, in units of (w / 2 + h, h + gap): where the name was meant to be, then above, below, right, left, then further out. */
const TRIES = [
  [0, 0],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -2],
  [0, 2],
] as const;

const hits = (x0: number, y0: number, x1: number, y1: number, b: Box) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0;

/**
 * Lettering that keeps clear of markers, turrets and each other (#38). Labels are placed in the given order (earlier
 * wins); each takes the first spot from TRIES whose box hits no obstacle and no label placed before it, else it is
 * hidden. Writes into `out` (reused across frames, grown as needed) and allocates nothing else; `n` and `nObstacles`
 * let the caller keep pools longer than what is used.
 */
export function placeLabels(labels: readonly LabelBox[], obstacles: readonly Box[], out: Placed[], gap = 2, n = labels.length, nObstacles = obstacles.length) {
  while (out.length < n) out.push({ x: 0, y: 0, visible: false });
  for (let i = 0; i < n; i++) {
    const l = labels[i]!;
    const p = out[i]!;
    p.visible = false;
    const hw = l.w / 2;
    const hh = l.h / 2;
    const stepX = hw + l.h;
    const stepY = l.h + gap;
    for (const [tx, ty] of TRIES) {
      const x = l.x + tx * stepX;
      const y = l.y + ty * stepY;
      const x0 = x - hw;
      const y0 = y - hh;
      const x1 = x + hw;
      const y1 = y + hh;
      let free = true;
      for (let k = 0; k < nObstacles && free; k++) if (hits(x0, y0, x1, y1, obstacles[k]!)) free = false;
      for (let k = 0; k < i && free; k++) {
        const q = out[k]!;
        if (!q.visible) continue;
        const o = labels[k]!;
        if (x0 < q.x + o.w / 2 + gap && x1 + gap > q.x - o.w / 2 && y0 < q.y + o.h / 2 + gap && y1 + gap > q.y - o.h / 2) free = false;
      }
      if (free) {
        p.x = x;
        p.y = y;
        p.visible = true;
        break;
      }
    }
  }
}
