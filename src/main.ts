import { level1 } from "./content/levels.ts";
import type { Point } from "./sim/map.ts";
import { canPlace, createWorld, DT, remaining, step, type World } from "./sim/world.ts";
import { drawTerrain, drawWorld, fitView, screenToCell, type View } from "./render/canvas.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const g = canvas.getContext("2d")!;
const $ = (id: string) => document.getElementById(id)!;
const startButton = $("start") as HTMLButtonElement;
const banner = $("banner");

const level = level1();
const placements: Point[] = [];
let world: World = createWorld(level, placements, 1);
let phase: "prepare" | "run" | "over" = "prepare";
let attempt = 0;
let hover: Point | undefined;

let view: View;
let terrain: HTMLCanvasElement;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  view = fitView(level.map, canvas.width, canvas.height - 120 * dpr);
  view.oy += 50 * dpr;
  terrain = drawTerrain(level.map, view.scale);
}
addEventListener("resize", resize);
resize();

function prepare() {
  phase = "prepare";
  world = createWorld(level, placements, attempt + 1);
  banner.hidden = true;
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

canvas.addEventListener("pointermove", (ev) => {
  if (phase !== "prepare") return;
  const dpr = window.devicePixelRatio || 1;
  hover = screenToCell(view, ev.clientX * dpr, ev.clientY * dpr);
});
canvas.addEventListener("pointerleave", () => (hover = undefined));
canvas.addEventListener("click", (ev) => {
  if (phase !== "prepare") return;
  const dpr = window.devicePixelRatio || 1;
  const cell = screenToCell(view, ev.clientX * dpr, ev.clientY * dpr);
  const i = placements.findIndex((p) => p.x === cell.x && p.y === cell.y);
  if (i >= 0) placements.splice(i, 1);
  else if (canPlace(level, placements, cell)) placements.push(cell);
  else return;
  world = createWorld(level, placements, attempt + 1);
  updateHud();
});

function updateHud() {
  $("remaining").textContent = String(remaining(world));
  const pct = Math.round((world.energy / level.goalEnergy) * 100);
  $("energy").textContent = `${pct} %`;
  $("energy-fill").style.width = `${pct}%`;
  $("capacity").textContent = `${placements.length}/${level.capacity}`;
}

function finish() {
  phase = "over";
  const won = world.status === "won";
  banner.innerHTML = won
    ? `${world.perfect ? "Perfect Clear" : "Sieg"}<small>Ziel bei ${Math.round((world.energy / level.goalEnergy) * 100)} %</small>`
    : `Niederlage<small>${world.killed} von ${level.enemies.count} Gegnern besiegt</small>`;
  banner.hidden = false;
  startButton.textContent = "Nächster Run";
  startButton.disabled = false;
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
updateHud();
requestAnimationFrame(frame);
