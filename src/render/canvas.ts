import type { GameMap, Point } from "../sim/map.ts";
import type { Placement, Shot, World } from "../sim/world.ts";
import { turretType, type TurretKind } from "../content/turrets.ts";
import { drawTerrain, sheetScale, shoreField, TerrainDetail, PAPER } from "./terrain.ts";
import { mapLabels, type Label } from "./labels.ts";
import { Fluid } from "./fluid.ts";
import { GLASS, MAP, SIGNAL } from "./theme.ts";

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

export function screenToCell(view: View, sx: number, sy: number): Point {
  return { x: Math.floor((sx - view.ox) / view.scale), y: Math.floor((sy - view.oy) / view.scale) };
}

/** What stays the same for a whole level: the drawn map, its sharp detail, its names and the liquid's buffers. */
export interface Scene {
  terrain: HTMLCanvasElement;
  detail: TerrainDetail;
  labels: Label[];
  fluid: Fluid;
}

/** `seed` picks the level's names; the same level always gets the same ones. */
export function createScene(map: GameMap, seed: number): Scene {
  const field = shoreField(map);
  return {
    terrain: drawTerrain(map, field),
    detail: new TerrainDetail(map, field, sheetScale(map)),
    labels: mapLabels(map, field, seed),
    fluid: new Fluid(field, map.width, map.height),
  };
}

/** Ticks of fire kept for the afterglow: shots fade over this many ticks instead of blinking for one. */
export const TRAIL_TICKS = 6;

/** The fire of the last ticks, oldest first; the frame loop pushes one entry per simulation tick. */
export class Trail {
  readonly ticks: (readonly Shot[])[] = [];
  push(shots: readonly Shot[]) {
    this.ticks.push(shots);
    if (this.ticks.length > TRAIL_TICKS) this.ticks.shift();
  }
  clear() {
    this.ticks.length = 0;
  }
}

export interface Overlay {
  /** The turret the player is about to place, or the one under the cursor. */
  hover?: { placement: Placement; valid: boolean; range: number; existing: boolean };
  /** Show every turret's swivel arc (preparation). */
  arcs?: boolean;
  /** Recent fire; without it only this tick's shots show. */
  trail?: Trail;
  /** Device pixels per CSS pixel: lettering keeps its size on screen. */
  dpr?: number;
}

export function drawWorld(g: CanvasRenderingContext2D, view: View, scene: Scene, w: World, alpha: number, time: number, overlay: Overlay) {
  const { scale: s, ox, oy } = view;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const map = w.level.map;
  g.imageSmoothingEnabled = true;
  g.drawImage(scene.terrain, ox, oy, map.width * s, map.height * s);
  scene.detail.draw(g, view);
  const at = (x: number, y: number) => [ox + x * s, oy + y * s] as const;
  drawLabels(g, scene.labels, at, s, overlay.dpr ?? 1);

  // Spawns as springs (rings welling outward), goals as harbours that fade as their energy drains.
  // Markers keep a minimum size so they read from afar.
  const marker = Math.max(s, 8);
  g.strokeStyle = SIGNAL.spawn;
  g.lineWidth = Math.max(2.5, s * 0.1);
  for (const p of map.spawns) {
    const [x, y] = at(p.x + 0.5, p.y + 0.5);
    for (let r = 0; r < 3; r++) {
      const t = (r + ((time * 0.6) % 1)) / 3;
      g.globalAlpha = 0.9 * (1 - t);
      ring(g, x, y, marker * (0.25 + t * 1.1));
    }
    g.globalAlpha = 1;
    g.fillStyle = SIGNAL.spawnCore;
    disc(g, x, y, marker * 0.3);
    ring(g, x, y, marker * 0.3);
  }
  g.globalAlpha = 1;
  map.goals.forEach((p, i) => {
    const [x, y] = at(p.x + 0.5, p.y + 0.5);
    const full = Math.max(0, w.energies[i]! / w.level.goalEnergy);
    g.globalAlpha = 0.35 + 0.65 * full;
    g.fillStyle = SIGNAL.goal;
    g.strokeStyle = SIGNAL.goalEdge;
    g.lineWidth = Math.max(1.5, s * 0.07);
    disc(g, x, y, marker * 0.85);
    ring(g, x, y, marker * 0.85);
    g.fillStyle = SIGNAL.goalCore;
    disc(g, x, y, marker * 0.32);
    const t = (time / 1.6) % 1;
    g.globalAlpha *= 1 - t;
    g.strokeStyle = SIGNAL.goal;
    ring(g, x, y, marker * (0.9 + t * 0.8));
    g.globalAlpha = 1;
  });

  scene.fluid.draw(g, w, view, alpha);

  // Range of every turret while preparing, then the turrets themselves.
  if (overlay.arcs) for (const t of w.turrets) drawArc(g, ...at(t.x, t.y), t.placement, t.stats.range * s, t.kind);
  const dpr = overlay.dpr ?? 1;
  for (const t of w.turrets) drawTurret(g, ...at(t.x, t.y), s, t.kind, t.aim, 1, dpr);

  // Fire with afterglow: older ticks fainter.
  const ticks = overlay.trail?.ticks.length ? overlay.trail.ticks : [w.shots];
  ticks.forEach((shots, k) => {
    const age = (ticks.length - 1 - k) / ticks.length;
    for (const shot of shots) drawShot(g, shot, at, s, age, time);
  });
  g.globalAlpha = 1;

  if (overlay.hover) {
    const { placement: p, valid, range, existing } = overlay.hover;
    const [cx, cy] = at(p.x + 0.5, p.y + 0.5);
    if (!valid) {
      g.fillStyle = SIGNAL.invalid;
      disc(g, cx, cy, turretUnit(s, overlay.dpr ?? 1) * 0.5);
    } else {
      drawArc(g, cx, cy, p, range * s, p.kind, 2);
      if (!existing) drawTurret(g, cx, cy, s, p.kind, ((p.facing ?? 0) * Math.PI) / 180, 0.6, overlay.dpr ?? 1);
    }
  }
}

/**
 * Names on the map (#18), in screen size so they stay legible at every zoom: waters in italics, islands and places in
 * spaced capitals, each on a dark halo. Hidden while the map is too small for them to fit.
 */
function drawLabels(g: CanvasRenderingContext2D, labels: readonly Label[], at: (x: number, y: number) => readonly [number, number], s: number, dpr: number) {
  if (s < 5 * dpr) return;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 3 * dpr;
  g.strokeStyle = MAP.labelHalo;
  for (const l of labels) {
    const [x, y] = at(l.x, l.y);
    if (x < -200 || y < -50 || x > g.canvas.width + 200 || y > g.canvas.height + 50) continue;
    if (l.kind === "water") {
      g.font = `italic 500 ${Math.round(16 * dpr)}px Alegreya, Georgia, serif`;
      g.letterSpacing = `${dpr}px`;
      g.fillStyle = MAP.labelWater;
    } else {
      g.font = `500 ${Math.round((l.kind === "island" ? 13 : 12) * dpr)}px Alegreya, Georgia, serif`;
      g.letterSpacing = `${2 * dpr}px`;
      g.fillStyle = MAP.labelLand;
    }
    const text = l.kind === "water" ? l.text : l.text.toUpperCase();
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  }
  g.letterSpacing = "0px";
}

/**
 * One shot at `age` (0 = this tick, towards 1 = about to vanish). Every effect has a dark rim, so it reads on the pale
 * map and on the bright mass alike.
 */
function drawShot(g: CanvasRenderingContext2D, shot: Shot, at: (x: number, y: number) => readonly [number, number], s: number, age: number, time: number) {
  const fade = 1 - age;
  g.lineCap = "round";
  if (shot.kind === "tracer") {
    const color = turretType(shot.turret).color;
    const [x0, y0] = at(shot.from.x, shot.from.y);
    const [x1, y1] = at(shot.to.x, shot.to.y);
    if (shot.turret === "laser" || shot.turret === "railgun") {
      // A beam: dark rim, wide coloured glow, white-hot core.
      line(g, x0, y0, x1, y1, GLASS.rim, Math.max(5, s * 0.34), 0.5 * fade);
      line(g, x0, y0, x1, y1, color, Math.max(4, s * 0.26), 0.6 * fade);
      line(g, x0, y0, x1, y1, "#ffffff", Math.max(1.5, s * 0.08), fade);
    } else if (shot.turret === "tesla") {
      // A bolt that crackles: a new zigzag every frame.
      const pts: [number, number][] = [[x0, y0]];
      const segs = 6;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        pts.push([x0 + (x1 - x0) * t + (Math.random() - 0.5) * s * 0.5, y0 + (y1 - y0) * t + (Math.random() - 0.5) * s * 0.5]);
      }
      pts.push([x1, y1]);
      path(g, pts, GLASS.rim, Math.max(3.5, s * 0.16), 0.5 * fade);
      path(g, pts, color, Math.max(2, s * 0.09), fade);
      path(g, pts, "#ffffff", Math.max(1, s * 0.03), fade);
    } else {
      // A bolt near its target, with a faint trace back to the barrel; it flies on as it fades.
      line(g, x0, y0, x1, y1, color, Math.max(1, s * 0.04), 0.35 * fade);
      const bx = x0 + (x1 - x0) * (0.55 + 0.25 * age);
      const by = y0 + (y1 - y0) * (0.55 + 0.25 * age);
      line(g, bx, by, x1, y1, GLASS.rim, Math.max(4, s * 0.17), 0.55 * fade);
      line(g, bx, by, x1, y1, color, Math.max(2.5, s * 0.11), fade);
    }
    // Impact: a flash that throws sparks.
    sparks(g, x1, y1, s, age, x0 + y0);
  } else if (shot.kind === "blast") {
    const [x, y] = at(shot.at.x, shot.at.y);
    const r = shot.radius * s * (0.55 + age * 0.75);
    // The fireball only while fresh: gradients are the costliest thing drawn, the ring alone carries the afterglow.
    if (age < 0.35) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255, 244, 200, ${0.9 * fade})`);
      grad.addColorStop(0.55, `rgba(255, 150, 60, ${0.55 * fade})`);
      grad.addColorStop(1, "rgba(255, 110, 40, 0)");
      // Fire adds light: on the dark map it glows instead of muddying the water.
      g.globalAlpha = 1;
      g.globalCompositeOperation = "lighter";
      g.fillStyle = grad;
      disc(g, x, y, r);
      g.globalCompositeOperation = "source-over";
    }
    // Shock wave: a ring that runs out as it fades.
    g.globalAlpha = 0.45 * fade * fade;
    g.strokeStyle = GLASS.rim;
    g.lineWidth = Math.max(3, s * 0.12);
    ring(g, x, y, r * 1.1);
    g.globalAlpha = fade * fade;
    g.strokeStyle = turretType(shot.turret).color;
    g.lineWidth = Math.max(1.5, s * 0.06);
    ring(g, x, y, r * 1.1);
    sparks(g, x, y, s * 1.4, age, x * 0.37 + y);
  } else if (age < 0.35) {
    const [x, y] = at(shot.from.x, shot.from.y);
    const r = shot.range * s * (0.9 + 0.1 * Math.sin(time * 40 + x));
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255, 244, 190, ${0.9 * fade})`);
    grad.addColorStop(0.45, `rgba(255, 123, 57, ${0.6 * fade})`);
    grad.addColorStop(1, "rgba(200, 40, 20, 0)");
    g.globalAlpha = 1;
    g.globalCompositeOperation = "lighter";
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, r, shot.aim - shot.angle / 2, shot.aim + shot.angle / 2);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = "source-over";
  }
  g.globalAlpha = 1;
}

/** A bright flash on a dark rim; as it ages it bursts into five sparks flying outward. */
function sparks(g: CanvasRenderingContext2D, x: number, y: number, s: number, age: number, seed: number) {
  const shrink = 1 - age * 0.5;
  g.globalAlpha = 1 - age;
  g.fillStyle = GLASS.rim;
  disc(g, x, y, Math.max(3, s * 0.2) * shrink);
  g.fillStyle = SIGNAL.spark;
  disc(g, x, y, Math.max(2, s * 0.13) * shrink);
  if (age <= 0) return;
  const d = s * (0.15 + age * 0.55);
  const r = Math.max(1, s * 0.05);
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = i * 1.2566 + seed;
    const sx = x + Math.cos(a) * d;
    const sy = y + Math.sin(a) * d;
    g.moveTo(sx + r, sy);
    g.arc(sx, sy, r, 0, Math.PI * 2);
  }
  g.fill();
}

/** Range and swivel arc of a placement: a full disc or a wedge around its facing, with a dotted edge. */
function drawArc(g: CanvasRenderingContext2D, x: number, y: number, p: Placement, r: number, kind: TurretKind, emphasis = 1) {
  const arc = ((p.arc ?? 360) * Math.PI) / 180;
  const facing = ((p.facing ?? 0) * Math.PI) / 180;
  g.beginPath();
  if (arc >= 2 * Math.PI - 1e-6) g.arc(x, y, r, 0, 2 * Math.PI);
  else {
    g.moveTo(x, y);
    g.arc(x, y, r, facing - arc / 2, facing + arc / 2);
    g.closePath();
  }
  g.globalAlpha = 0.1 * emphasis;
  g.fillStyle = turretType(kind).color;
  g.fill();
  g.globalAlpha = Math.min(1, 0.5 * emphasis);
  g.strokeStyle = GLASS.rim;
  g.lineWidth = 1;
  g.setLineDash([2, 4]);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
}

/**
 * Smallest radius of a turret's disc in CSS pixels (#36): on a large map in the overview it stays a turret. Not more,
 * so neighbouring turrets touch rather than melt into one blob.
 */
export const TURRET_MIN_RADIUS = 8;

/**
 * The cell size a turret is drawn at: the map's cell size `s`, but never so small that the disc gets below
 * TURRET_MIN_RADIUS CSS pixels. Up close it is just `s`, so the close-up look does not change; the range stays to scale.
 */
export function turretUnit(s: number, dpr: number): number {
  return Math.max(s, (TURRET_MIN_RADIUS * dpr) / 0.45);
}

/** How far a turret's drawing reaches from its centre (disc, glow and barrel), in canvas pixels. */
export function turretReach(s: number, dpr: number): number {
  return turretUnit(s, dpr) * 0.66;
}

/**
 * Dark glass disc with a ring in the kind's colour, a barrel along the aim and the kind's symbol: the same symbol as
 * in the bar and in research (#2). From afar it keeps a minimum size (`turretUnit`), so the symbol always reads.
 */
export function drawTurret(g: CanvasRenderingContext2D, x: number, y: number, cell: number, kind: TurretKind, aim: number, opacity = 1, dpr = 1) {
  const t = turretType(kind);
  const s = turretUnit(cell, dpr);
  const r = s * 0.45;
  // Soft outer ring: the glow of the glass.
  g.globalAlpha = 0.35 * opacity;
  g.strokeStyle = t.color;
  g.lineWidth = Math.max(2, s * 0.16);
  ring(g, x, y, r + g.lineWidth / 2);
  g.globalAlpha = opacity;
  g.fillStyle = GLASS.body;
  disc(g, x, y, r);
  g.lineWidth = Math.max(1.5, s * 0.07);
  ring(g, x, y, r);
  g.lineWidth = Math.max(2, s * 0.12);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x + Math.cos(aim) * r * 0.45, y + Math.sin(aim) * r * 0.45);
  g.lineTo(x + Math.cos(aim) * s * 0.66, y + Math.sin(aim) * s * 0.66);
  g.stroke();
  g.fillStyle = t.color;
  // From afar the symbol fills more of the disc, so it reads at the minimum size; up close it keeps its old size.
  g.font = `${Math.round(Math.max(s * 0.4, 10 * dpr))}px Sora, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(t.symbol, x, y + s * 0.02);
  g.globalAlpha = 1;
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number, alpha: number) {
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function path(g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], color: string, width: number, alpha: number) {
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = "round";
  g.beginPath();
  for (const [x, y] of pts) g.lineTo(x, y);
  g.stroke();
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}
