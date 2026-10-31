import { LEVELS } from "./content/levels.ts";
import type { Point } from "./sim/map.ts";
import { canPlace, createWorld, DT, remaining, step, type LevelDef, type World } from "./sim/world.ts";
import { drawTerrain, drawWorld, fitView, screenToCell, zoomAt, type View } from "./render/canvas.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const g = canvas.getContext("2d")!;
const $ = (id: string) => document.getElementById(id)!;
const startButton = $("start") as HTMLButtonElement;
const nextButton = $("next") as HTMLButtonElement;
const banner = $("banner");
const dpr = () => window.devicePixelRatio || 1;

let levelIndex = 0;
let level: LevelDef;
let placements: Point[] = [];
let world: World;
let phase: "prepare" | "run" | "over" = "prepare";
let attempt = 0;
let hover: Point | undefined;
let view: View;
let fitted: View;
let terrain: HTMLCanvasElement;

function loadLevel(i: number) {
  levelIndex = i;
  level = LEVELS[i]!();
  placements = [];
  attempt = 0;
  terrain = drawTerrain(level.map, 24);
  fit();
  $("level").textContent = String(i + 1);
  prepare();
}

/** Camera that shows the whole lake between HUD and bar. */
function fit() {
  canvas.width = Math.round(innerWidth * dpr());
  canvas.height = Math.round(innerHeight * dpr());
  fitted = fitView(level.map, canvas.width, canvas.height - 120 * dpr());
  fitted.oy += 50 * dpr();
  view = { ...fitted };
}
addEventListener("resize", fit);

function prepare() {
  phase = "prepare";
  world = createWorld(level, placements, attempt + 1);
  banner.hidden = true;
  nextButton.hidden = true;
  startButton.textContent = "Run starten";
  startButton.disabled = false;
  updateHud();
}

startButton.addEventListener("click", () => {
  if (phase === "prepare") {
    attempt++;
    world = createWorld(level, placements, attempt);
    phase = "run";
    startButton.disabled = true;
    hover = undefined;
  } else if (phase === "over") {
    prepare();
  }
});
nextButton.addEventListener("click", () => loadLevel(levelIndex + 1));

// Camera: wheel zooms at the cursor; dragging pans. A short press without movement is a click.
let drag: { x: number; y: number; ox: number; oy: number; moved: boolean } | undefined;
canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  view = zoomAt(view, ev.clientX * dpr(), ev.clientY * dpr(), Math.exp(-ev.deltaY * 0.0015), fitted.scale * 0.5, 64 * dpr());
}, { passive: false });
canvas.addEventListener("pointerdown", (ev) => {
  drag = { x: ev.clientX, y: ev.clientY, ox: view.ox, oy: view.oy, moved: false };
});
canvas.addEventListener("pointermove", (ev) => {
  if (drag && (drag.moved || Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 5)) {
    drag.moved = true;
    view = { ...view, ox: drag.ox + (ev.clientX - drag.x) * dpr(), oy: drag.oy + (ev.clientY - drag.y) * dpr() };
  }
  hover = phase === "prepare" && !drag?.moved ? screenToCell(view, ev.clientX * dpr(), ev.clientY * dpr()) : undefined;
});
canvas.addEventListener("pointerleave", () => (hover = undefined));
canvas.addEventListener("pointerup", (ev) => {
  const wasDrag = drag?.moved;
  drag = undefined;
  if (wasDrag || phase !== "prepare") return;
  const cell = screenToCell(view, ev.clientX * dpr(), ev.clientY * dpr());
  const i = placements.findIndex((p) => p.x === cell.x && p.y === cell.y);
  if (i >= 0) placements.splice(i, 1);
  else if (canPlace(level, placements, cell)) placements.push(cell);
  else return;
  world = createWorld(level, placements, attempt + 1);
  updateHud();
});
addEventListener("keydown", (ev) => {
  if (ev.key === "0" || ev.key === "Home") view = { ...fitted };
});

const fmt = new Intl.NumberFormat("de-DE");
function updateHud() {
  $("remaining").textContent = fmt.format(remaining(world));
  const pct = Math.max(0, Math.round((world.energy / level.goalEnergy) * 100));
  $("energy").textContent = `${pct} %`;
  $("energy-fill").style.width = `${pct}%`;
  $("capacity").textContent = `${placements.length}/${level.capacity}`;
}

function finish() {
  phase = "over";
  const won = world.status === "won";
  banner.innerHTML = won
    ? `${world.perfect ? "Perfect Clear" : "Sieg"}<small>Ziel bei ${Math.round((world.energy / level.goalEnergy) * 100)} %</small>`
    : `Niederlage<small>${fmt.format(world.killed)} von ${fmt.format(level.enemies.count)} Gegnern besiegt</small>`;
  banner.hidden = false;
  startButton.textContent = "Nächster Run";
  startButton.disabled = false;
  nextButton.hidden = !(won && levelIndex + 1 < LEVELS.length);
}

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (phase === "run") {
    acc += elapsed;
    while (acc >= DT && world.status === "running") {
      step(world);
      acc -= DT;
    }
    updateHud();
    if (world.status !== "running") finish();
  }
  const valid = hover ? canPlace(level, placements, hover) || placements.some((p) => p.x === hover!.x && p.y === hover!.y) : false;
  drawWorld(g, view, terrain, world, phase === "run" ? acc / DT : 1, now / 1000, {
    hover: hover && phase === "prepare" ? { cell: hover, valid, range: level.turret.range } : undefined,
  });
  requestAnimationFrame(frame);
}

loadLevel(Math.min(LEVELS.length - 1, Math.max(0, Number(new URLSearchParams(location.search).get("level") ?? 1) - 1)));
requestAnimationFrame(frame);
