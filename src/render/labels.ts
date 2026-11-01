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
