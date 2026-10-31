import { describe, expect, it } from "vitest";
import { enemyCount, LEVELS } from "../../src/content/levels.ts";
import { ENEMY_TYPES } from "../../src/content/enemies.ts";
import { cellAt, LAND, WATER, type GameMap, type Point } from "../../src/sim/map.ts";
import { distanceField, UNREACHABLE } from "../../src/sim/flow.ts";

const levels = LEVELS.map((make) => make());

/** Cells of the cheapest path from p down the field to a goal. */
function pathFrom(map: GameMap, field: Float64Array, p: Point): Point[] {
  const out: Point[] = [p];
  let cur = p;
  for (let guard = 0; guard < map.width * map.height; guard++) {
    const here = field[cur.y * map.width + cur.x]!;
    if (here === 0) break;
    let best = cur;
    let bestD = here;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cur.x + dx;
        const y = cur.y + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const d = field[y * map.width + x]!;
        if (d < bestD) [best, bestD] = [{ x, y }, d];
      }
    if (best === cur) break;
    cur = best;
    out.push(cur);
  }
  return out;
}

describe("campaign", () => {
  it("has 25 levels", () => {
    expect(levels.length).toBe(25);
  });

  it("keeps its maps: the same level twice is the same lake", () => {
    expect(LEVELS[7]!().map.cells).toEqual(levels[7]!.map.cells);
  });

  describe.each(levels.map((l, i) => [i + 1, l] as const))("level %i", (_n, l) => {
    const { map } = l;
    const field = distanceField(map, map.goals);

    it("puts every spawn and goal on water, and every spawn reaches a goal", () => {
      for (const p of [...map.spawns, ...map.goals]) expect(cellAt(map, p.x, p.y)).toBe(WATER);
      for (const s of map.spawns) expect(field[s.y * map.width + s.x]).not.toBe(UNREACHABLE);
    });

    // Routes part and meet in the open basins around spawns and goals; the test blocks the route between them.
    it("has a way around: blocking the cheapest route (three cells wide) between the basins leaves another", () => {
      for (const s of map.spawns) {
        const path = pathFrom(map, field, s);
        const cells = map.cells.slice();
        for (const p of path) {
          const nearEnd = [s, ...map.goals].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 9);
          if (nearEnd) continue;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const x = p.x + dx;
              const y = p.y + dy;
              if (x >= 0 && y >= 0 && x < map.width && y < map.height) cells[y * map.width + x] = LAND;
            }
        }
        const blocked = distanceField({ ...map, cells }, map.goals);
        expect(blocked[s.y * map.width + s.x], `spawn ${s.x},${s.y}`).not.toBe(UNREACHABLE);
      }
    });

    it("has land and water in real shares, and shore to build on", () => {
      const land = map.cells.filter((c) => c === LAND).length / map.cells.length;
      expect(land).toBeGreaterThan(0.2);
      expect(land).toBeLessThan(0.8);
      let shore = 0;
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++)
          if (cellAt(map, x, y) === LAND && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cellAt(map, x + dx!, y + dy!) === WATER)) shore++;
      expect(shore).toBeGreaterThan(40);
    });

    it("leaves no water the goals cannot reach", () => {
      for (let i = 0; i < map.cells.length; i++) if (map.cells[i] === WATER) expect(field[i]).not.toBe(UNREACHABLE);
    });

    it("keeps the blob count bounded and every group on a real spawn", () => {
      expect(enemyCount(l) / (l.enemies.packet ?? 1)).toBeLessThanOrEqual(4000);
      for (const g of l.enemies.groups) expect(g.spawn ?? 0).toBeLessThan(map.spawns.length);
    });

    it("lets the taps run for a real-time run: 40 s to 3 min of spawning", () => {
      const seconds = Math.max(...l.enemies.groups.map((g) => (g.start ?? 0) + g.count / g.perSecond));
      expect(seconds).toBeGreaterThanOrEqual(40);
      expect(seconds).toBeLessThanOrEqual(180);
    });
  });

  it("grows from a handful to about a million enemies", () => {
    const counts = levels.map(enemyCount);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!);
    expect(counts[0]).toBeLessThan(100);
    expect(counts[24]).toBeGreaterThan(500_000);
    expect(counts[24]).toBeLessThanOrEqual(1_200_000);
  });

  it("starts with one spawn and goal, adds spawns early and goals only late", () => {
    expect(levels[0]!.map.spawns.length).toBe(1);
    expect(levels[0]!.map.goals.length).toBe(1);
    expect(levels[5]!.map.spawns.length).toBeGreaterThan(1);
    expect(levels.slice(0, 15).every((l) => l.map.goals.length === 1)).toBe(true);
    expect(levels[24]!.map.goals.length).toBeGreaterThan(1);
  });

  it("introduces enemy types one by one and uses all of them", () => {
    expect(levels[0]!.enemies.groups.map((g) => g.type)).toEqual(["green"]);
    const used = new Set(levels.flatMap((l) => l.enemies.groups.map((g) => g.type)));
    for (const t of ENEMY_TYPES) expect(used.has(t.id), t.id).toBe(true);
  });

  it("maps grow with the campaign", () => {
    const area = levels.map((l) => l.map.width * l.map.height);
    expect(area[24]).toBeGreaterThan(area[0]! * 8);
  });
});
