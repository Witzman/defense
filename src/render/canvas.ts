import { LAND, cellAt, type GameMap, type Point } from "../sim/map.ts";
import type { Placement, World } from "../sim/world.ts";
import { ENEMY_TYPES } from "../content/enemies.ts";
import { turretType, type TurretKind } from "../content/turrets.ts";

const ENEMY_COLORS = new Map(ENEMY_TYPES.map((t) => [t.id, t] as const));
const RGB = new Map(ENEMY_TYPES.map((t) => [t.id, hexToRgb(t.color)] as const));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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

/** Zoom by `factor` keeping the map point under (sx, sy) where it is. */
export function zoomAt(view: View, sx: number, sy: number, factor: number, min: number, max: number): View {
  const scale = Math.min(max, Math.max(min, view.scale * factor));
  const k = scale / view.scale;
  return { scale, ox: sx - (sx - view.ox) * k, oy: sy - (sy - view.oy) * k };
}

/** Pixels per cell above which enemies are drawn one by one; below FIELD_SCALE only the density field shows. */
export const BLOB_SCALE = 14;
export const FIELD_SCALE = 7;

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
  /** The turret the player is about to place, or the one under the cursor. */
  hover?: { placement: Placement; valid: boolean; range: number; existing: boolean };
  /** Show every turret's swivel arc (preparation). */
  arcs?: boolean;
}

export function drawWorld(g: CanvasRenderingContext2D, view: View, terrain: HTMLCanvasElement, w: World, alpha: number, time: number, overlay: Overlay) {
  const { scale: s, ox, oy } = view;
  g.fillStyle = COLORS.land;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const map = w.level.map;
  g.imageSmoothingEnabled = true;
  g.drawImage(terrain, ox, oy, map.width * s, map.height * s);
  const at = (x: number, y: number) => [ox + x * s, oy + y * s] as const;

  // Spawns and goals; a goal fades as its energy drains. Markers keep a minimum size so they read from afar.
  const marker = Math.max(s, 6);
  g.fillStyle = COLORS.spawn;
  for (const p of map.spawns) disc(g, ...at(p.x + 0.5, p.y + 0.5), marker * 0.6);
  const pulse = 1 + 0.08 * Math.sin(time * 4);
  map.goals.forEach((p, i) => {
    g.globalAlpha = 0.35 + 0.65 * Math.max(0, w.energies[i]! / w.level.goalEnergy);
    g.fillStyle = COLORS.goal;
    polygon(g, ...at(p.x + 0.5, p.y + 0.5), marker * 1.1 * pulse, 8);
    g.globalAlpha = 1;
  });

  // Enemies: one by one up close, a smooth density field from afar, both in between.
  const blobs = Math.min(1, Math.max(0, (s - FIELD_SCALE) / (BLOB_SCALE - FIELD_SCALE)));
  if (blobs < 1) {
    g.globalAlpha = 1 - blobs * 0.7;
    drawDensity(g, w, view);
    g.globalAlpha = 1;
  }
  if (blobs > 0) {
    g.globalAlpha = blobs;
    g.lineWidth = Math.max(1, s * 0.06);
    const minX = -ox / s - 1;
    const maxX = (g.canvas.width - ox) / s + 1;
    const minY = -oy / s - 1;
    const maxY = (g.canvas.height - oy) / s + 1;
    for (const e of w.enemies) {
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const t = ENEMY_COLORS.get(e.type)!;
      g.fillStyle = t.color;
      g.strokeStyle = t.edge;
      // A packet of many reads a little bigger than a single enemy.
      blob(g, ...at(x, y), s * 0.3 * (1 + Math.min(0.6, Math.log10(e.size) * 0.3)), time + e.id * 1.7);
    }
    g.globalAlpha = 1;
  }

  // Turrets, with their swivel arc while preparing.
  for (const t of w.turrets) {
    const [x, y] = at(t.x, t.y);
    if (overlay.arcs) drawArc(g, x, y, t.placement, t.stats.range * s, t.kind);
    drawTurret(g, x, y, s, t.kind, t.aim);
  }

  // Shots of the last tick.
  for (const shot of w.shots) {
    if (shot.kind === "tracer") {
      g.strokeStyle = turretType(shot.turret).color;
      g.lineWidth = Math.max(1, s * (shot.turret === "laser" ? 0.09 : 0.05));
      g.beginPath();
      g.moveTo(...at(shot.from.x, shot.from.y));
      g.lineTo(...at(shot.to.x, shot.to.y));
      g.stroke();
    } else if (shot.kind === "blast") {
      g.fillStyle = "rgba(255, 210, 120, 0.45)";
      disc(g, ...at(shot.at.x, shot.at.y), shot.radius * s);
    } else {
      const [x, y] = at(shot.from.x, shot.from.y);
      g.fillStyle = "rgba(255, 123, 57, 0.35)";
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, shot.range * s, shot.aim - shot.angle / 2, shot.aim + shot.angle / 2);
      g.closePath();
      g.fill();
    }
  }

  if (overlay.hover) {
    const { placement: p, valid, range, existing } = overlay.hover;
    const [cx, cy] = at(p.x + 0.5, p.y + 0.5);
    if (!valid) {
      g.fillStyle = COLORS.invalid;
      disc(g, cx, cy, s * 0.5);
    } else {
      drawArc(g, cx, cy, p, range * s, p.kind, 0.3);
      if (!existing) drawTurret(g, cx, cy, s, p.kind, ((p.facing ?? 0) * Math.PI) / 180, 0.6);
    }
  }
}

/** Range and swivel arc of a placement: a full disc, or a wedge around its facing. */
function drawArc(g: CanvasRenderingContext2D, x: number, y: number, p: Placement, r: number, kind: TurretKind, alpha = 0.12) {
  const arc = ((p.arc ?? 360) * Math.PI) / 180;
  const facing = ((p.facing ?? 0) * Math.PI) / 180;
  g.globalAlpha = alpha;
  g.fillStyle = turretType(kind).color;
  g.beginPath();
  if (arc >= 2 * Math.PI - 1e-6) g.arc(x, y, r, 0, 2 * Math.PI);
  else {
    g.moveTo(x, y);
    g.arc(x, y, r, facing - arc / 2, facing + arc / 2);
    g.closePath();
  }
  g.fill();
  g.globalAlpha = 1;
}

let densityCanvas: HTMLCanvasElement | undefined;
let densityImage: ImageData | undefined;
let softCanvas: HTMLCanvasElement | undefined;
let mix: Float32Array | undefined;

/** Enemy density per cell as a small image, scaled up with smoothing: masses read as a fluid. */
function drawDensity(g: CanvasRenderingContext2D, w: World, view: View) {
  const { width, height } = w.level.map;
  if (!densityCanvas || densityCanvas.width !== width || densityCanvas.height !== height) {
    densityCanvas = document.createElement("canvas");
    densityCanvas.width = width;
    densityCanvas.height = height;
    densityImage = densityCanvas.getContext("2d")!.createImageData(width, height);
  }
  const data = densityImage!.data;
  // Colour per cell is the size-weighted mix of the types in it, so groups stay apart even from afar.
  const n = width * height;
  if (!mix || mix.length !== n * 4) mix = new Float32Array(n * 4);
  const m = mix;
  m.fill(0);
  for (const e of w.enemies) {
    const i = (Math.floor(e.y) * width + Math.floor(e.x)) * 4;
    const [r, gg, b] = RGB.get(e.type)!;
    m[i]! += r * e.size;
    m[i + 1]! += gg * e.size;
    m[i + 2]! += b * e.size;
    m[i + 3]! += e.size;
  }
  for (let i = 0; i < n; i++) {
    const d = m[i * 4 + 3]!;
    data[i * 4] = d > 0 ? m[i * 4]! / d : 0;
    data[i * 4 + 1] = d > 0 ? m[i * 4 + 1]! / d : 0;
    data[i * 4 + 2] = d > 0 ? m[i * 4 + 2]! / d : 0;
    // Any presence reads clearly; fuller cells get denser. Square root keeps thin streams visible.
    data[i * 4 + 3] = d <= 0 ? 0 : Math.min(255, 150 + Math.sqrt(d / w.cellCapacity) * 105);
  }
  densityCanvas.getContext("2d")!.putImageData(densityImage!, 0, 0);
  // Blur at low resolution melts neighbouring cells into one body (a stream, not a grid of dots) and stays cheap:
  // the filter runs on a canvas of 4 pixels per cell, not on the screen.
  if (!softCanvas || softCanvas.width !== width * 4 || softCanvas.height !== height * 4) {
    softCanvas = document.createElement("canvas");
    softCanvas.width = width * 4;
    softCanvas.height = height * 4;
  }
  const soft = softCanvas.getContext("2d")!;
  soft.clearRect(0, 0, softCanvas.width, softCanvas.height);
  soft.filter = "blur(2px)";
  soft.imageSmoothingEnabled = true;
  soft.drawImage(densityCanvas, 0, 0, softCanvas.width, softCanvas.height);
  soft.filter = "none";
  g.imageSmoothingEnabled = true;
  g.drawImage(softCanvas, view.ox, view.oy, width * view.scale, height * view.scale);
}

/** Ring in the kind's colour, dark body, a barrel along the aim and the kind's symbol: the same symbol as in the bar. */
export function drawTurret(g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: TurretKind, aim: number, opacity = 1) {
  const t = turretType(kind);
  g.globalAlpha = opacity;
  g.fillStyle = t.color;
  disc(g, x, y, s * 0.45);
  g.fillStyle = COLORS.turret;
  disc(g, x, y, s * 0.35);
  g.strokeStyle = t.color;
  g.lineWidth = Math.max(1.5, s * 0.12);
  g.beginPath();
  g.moveTo(x + Math.cos(aim) * s * 0.2, y + Math.sin(aim) * s * 0.2);
  g.lineTo(x + Math.cos(aim) * s * 0.62, y + Math.sin(aim) * s * 0.62);
  g.stroke();
  if (s >= 14) {
    g.fillStyle = t.color;
    g.font = `${Math.round(s * 0.42)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t.symbol, x, y + s * 0.02);
  }
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
