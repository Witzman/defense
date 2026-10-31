import { LAND, cellAt, type GameMap, type Point } from "../sim/map.ts";
import type { World } from "../sim/world.ts";

/** Flat style after the owner's reference (ref-5): light islands on dark water. */
export const COLORS = {
  water: "#14213d",
  waterLine: "#1c2c50",
  land: "#5fb8b4",
  shore: "#3f8f8c",
  enemy: "#a7d64a",
  enemyEdge: "#6f9a24",
  goal: "#e2483d",
  spawn: "#f2c14e",
  turret: "#2b2d42",
  turretRing: "#edf2f4",
  shot: "rgba(255,255,255,0.85)",
  range: "rgba(255,255,255,0.18)",
  invalid: "rgba(226,72,61,0.5)",
};

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

/** Fit the whole map into the canvas, centred. */
export function fitView(map: GameMap, width: number, height: number): View {
  const scale = Math.min(width / map.width, height / map.height);
  return { scale, ox: (width - map.width * scale) / 2, oy: (height - map.height * scale) / 2 };
}

export function screenToCell(view: View, sx: number, sy: number): Point {
  return { x: Math.floor((sx - view.ox) / view.scale), y: Math.floor((sy - view.oy) / view.scale) };
}

/** The map does not change during a run: draw it once into an offscreen canvas. */
export function drawTerrain(map: GameMap, scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(map.width * scale);
  c.height = Math.ceil(map.height * scale);
  const g = c.getContext("2d")!;
  g.fillStyle = COLORS.water;
  g.fillRect(0, 0, c.width, c.height);
  // Outside the map counts as land (cellAt): the playing field is a lake framed by shore.
  for (let y = -1; y <= map.height; y++)
    for (let x = -1; x <= map.width; x++)
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
        g.fillStyle = COLORS.shore;
        disc(g, (x + 0.5) * scale, (y + 0.5) * scale, scale * 0.9);
      }
  // Land as rounded blobs so islands read as organic shapes, not squares.
  g.fillStyle = COLORS.shore;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (cellAt(map, x, y) === LAND) disc(g, (x + 0.5) * scale, (y + 0.5) * scale, scale * 0.86);
  g.fillStyle = COLORS.land;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (cellAt(map, x, y) === LAND) disc(g, (x + 0.5) * scale, (y + 0.5) * scale, scale * 0.74);
  return c;
}

export interface Overlay {
  hover?: { cell: Point; valid: boolean; range: number };
}

export function drawWorld(g: CanvasRenderingContext2D, view: View, terrain: HTMLCanvasElement, w: World, alpha: number, time: number, overlay: Overlay) {
  const { scale: s, ox, oy } = view;
  g.fillStyle = COLORS.land;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.drawImage(terrain, ox, oy);
  const map = w.level.map;
  const at = (x: number, y: number) => [ox + x * s, oy + y * s] as const;

  // Spawn and goal.
  g.fillStyle = COLORS.spawn;
  disc(g, ...at(map.spawn.x + 0.5, map.spawn.y + 0.5), s * 0.6);
  const pulse = 1 + 0.08 * Math.sin(time * 4);
  g.fillStyle = COLORS.goal;
  polygon(g, ...at(map.goal.x + 0.5, map.goal.y + 0.5), s * 1.1 * pulse, 8);

  // Enemies as wobbling blobs.
  g.fillStyle = COLORS.enemy;
  g.strokeStyle = COLORS.enemyEdge;
  g.lineWidth = Math.max(1, s * 0.06);
  for (const e of w.enemies) {
    const x = e.px + (e.x - e.px) * alpha;
    const y = e.py + (e.y - e.py) * alpha;
    blob(g, ...at(x, y), s * 0.32, time + e.id * 1.7);
  }

  // Shots of the last tick.
  g.strokeStyle = COLORS.shot;
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  for (const shot of w.shots) {
    g.moveTo(...at(shot.from.x, shot.from.y));
    g.lineTo(...at(shot.to.x, shot.to.y));
  }
  g.stroke();

  // Turrets.
  for (const t of w.turrets) drawTurret(g, ...at(t.cell.x + 0.5, t.cell.y + 0.5), s);

  if (overlay.hover) {
    const { cell, valid, range } = overlay.hover;
    const [cx, cy] = at(cell.x + 0.5, cell.y + 0.5);
    g.fillStyle = valid ? COLORS.range : COLORS.invalid;
    disc(g, cx, cy, range * s);
    if (valid) drawTurret(g, cx, cy, s, 0.6);
  }
}

function drawTurret(g: CanvasRenderingContext2D, x: number, y: number, s: number, opacity = 1) {
  g.globalAlpha = opacity;
  g.fillStyle = COLORS.turretRing;
  disc(g, x, y, s * 0.45);
  g.fillStyle = COLORS.turret;
  disc(g, x, y, s * 0.33);
  g.globalAlpha = 1;
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function polygon(g: CanvasRenderingContext2D, x: number, y: number, r: number, n: number) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number) {
  g.beginPath();
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.14 * Math.sin(phase * 3 + i * 2.1));
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.stroke();
}
