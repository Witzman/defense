import { LEVELS } from "./content/levels.ts";
import { createSaver, loadSave } from "./game/api.ts";
import { runPoints } from "./game/points.ts";
import { buy, canBuy, CATALOG, deriveLoadout, type Effect, type Loadout } from "./game/research.ts";
import { emptySave, recordRun, setPlacements, type Save } from "./game/save.ts";
import type { Point } from "./sim/map.ts";
import { canPlace, createWorld, DT, remaining, step, type LevelDef, type World } from "./sim/world.ts";
import { drawTerrain, drawWorld, fitView, screenToCell, zoomAt, type View } from "./render/canvas.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const g = canvas.getContext("2d")!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const startButton = $<HTMLButtonElement>("start");
const nextButton = $<HTMLButtonElement>("next");
const banner = $("banner");
const hint = $("hint");
const dpr = () => window.devicePixelRatio || 1;
const fmt = new Intl.NumberFormat("de-DE");

let save: Save = emptySave();
let loadout: Loadout = deriveLoadout([]);
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

const saver = createSaver((state) => {
  const el = $("save-state");
  el.textContent = state === "saved" ? "gespeichert" : state === "saving" ? "speichert …" : "nicht gespeichert – neuer Versuch";
  el.classList.toggle("failed", state === "failed");
});
/** False when the stored game could not be read: then nothing is written, so a broken load never overwrites it. */
let canStore = true;
function commit(next: Save) {
  save = next;
  loadout = deriveLoadout(save.research);
  if (canStore) saver.save(save);
  updateHud();
}

const arsenal = () => ({ capacity: loadout.capacity, turret: loadout.turret });

function openLevel(i: number) {
  levelIndex = i;
  level = LEVELS[i]!();
  // Keep only placements that still fit the current map and capacity.
  placements = [];
  for (const p of save.levels[i]?.placements ?? []) if (canPlace(level, loadout.capacity, placements, p)) placements.push(p);
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
addEventListener("resize", () => level && fit());

function prepare() {
  phase = "prepare";
  world = createWorld(level, arsenal(), placements, attempt + 1);
  banner.hidden = true;
  nextButton.hidden = true;
  startButton.textContent = "Run starten";
  startButton.disabled = false;
  updateHud();
}

startButton.addEventListener("click", () => {
  if (phase === "prepare") {
    attempt++;
    world = createWorld(level, arsenal(), placements, attempt);
    phase = "run";
    startButton.disabled = true;
    hover = undefined;
    closePanels();
    commit(setPlacements(save, levelIndex, placements));
  } else if (phase === "over") {
    prepare();
  }
});
nextButton.addEventListener("click", () => openLevel(levelIndex + 1));

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
  else if (canPlace(level, loadout.capacity, placements, cell)) placements.push(cell);
  else return;
  world = createWorld(level, arsenal(), placements, attempt + 1);
  updateHud();
});
addEventListener("keydown", (ev) => {
  if (ev.key === "0" || ev.key === "Home") view = { ...fitted };
  if (ev.key === "Escape") closePanels();
});

function updateHud() {
  if (!world) return;
  $("remaining").textContent = fmt.format(remaining(world));
  const pct = Math.max(0, Math.round((world.energy / level.goalEnergy) * 100));
  $("energy").textContent = `${pct} %`;
  $("energy-fill").style.width = `${pct}%`;
  $("capacity").textContent = `${placements.length}/${loadout.capacity}`;
  $("points").textContent = fmt.format(Math.floor(save.points));
  $("research-points").textContent = fmt.format(Math.floor(save.points));
  hint.hidden = !(phase === "prepare" && (!loadout.unlocked || placements.length === 0));
  hint.textContent = !loadout.unlocked
    ? "Noch kein Geschütz – erforsche zuerst eins."
    : "Klick auf Land setzt eine Kanone, Klick auf eine Kanone entfernt sie.";
}

function finish() {
  phase = "over";
  const won = world.status === "won";
  const earned = runPoints(levelIndex, world.killed, level.enemies.count);
  commit(recordRun(save, levelIndex, { status: won ? "won" : "lost", killed: world.killed, total: level.enemies.count, perfect: world.perfect }, LEVELS.length));
  const pct = Math.round((world.energy / level.goalEnergy) * 100);
  banner.innerHTML = won
    ? `${world.perfect ? "Perfect Clear" : "Sieg"}<small>Ziel bei ${pct} % · +${fmt.format(earned)} ◆</small>`
    : `Niederlage<small>${fmt.format(world.killed)} von ${fmt.format(level.enemies.count)} besiegt · +${fmt.format(earned)} ◆</small>`;
  banner.hidden = false;
  startButton.textContent = "Nächster Run";
  startButton.disabled = false;
  nextButton.hidden = !(won && levelIndex + 1 < LEVELS.length);
}

// Panels.
function closePanels() {
  for (const p of document.querySelectorAll<HTMLElement>(".panel")) p.hidden = true;
}
for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", closePanels);
$("campaign-open").addEventListener("click", () => {
  if (phase === "run") return;
  closePanels();
  renderCampaign();
  $("campaign").hidden = false;
});
$("research-open").addEventListener("click", () => {
  if (phase === "run") return;
  closePanels();
  renderResearch();
  $("research").hidden = false;
});

function renderCampaign() {
  $("levels").replaceChildren(
    ...LEVELS.map((_, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      const p = save.levels[i];
      const state = p?.perfect ? "★ Perfect Clear" : p?.won ? "✓ geschafft" : i <= save.unlockedLevel ? "offen" : "gesperrt";
      b.innerHTML = `Level ${i + 1}<span class="state">${state}</span>`;
      b.disabled = i > save.unlockedLevel;
      b.classList.toggle("current", i === levelIndex);
      b.addEventListener("click", () => {
        closePanels();
        openLevel(i);
      });
      li.append(b);
      return li;
    }),
  );
}

function describe(e: Effect): string {
  switch (e.kind) {
    case "unlock":
      return "schaltet die Kanone frei";
    case "capacity":
      return `+${e.add} Kanone${e.add === 1 ? "" : "n"}`;
    case "fireRate":
      return `Feuerrate ×${e.mul}`;
    case "range":
      return `Reichweite +${e.add}`;
    case "damage":
      return `Schaden ×${e.mul}`;
  }
}

function renderResearch() {
  $("research-points").textContent = fmt.format(Math.floor(save.points));
  $("nodes").replaceChildren(
    ...CATALOG.map((n) => {
      const li = document.createElement("li");
      const owned = save.research.includes(n.id);
      const reachable = n.requires.every((r) => save.research.includes(r));
      li.className = owned ? "owned" : reachable ? "" : "locked";
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = owned ? "erforscht" : `◆ ${fmt.format(n.cost)}`;
      b.disabled = !canBuy(save, n.id);
      b.addEventListener("click", () => {
        if (!canBuy(save, n.id)) return;
        commit(buy(save, n.id));
        if (phase === "prepare") world = createWorld(level, arsenal(), placements, attempt + 1);
        renderResearch();
      });
      const name = document.createElement("strong");
      name.textContent = n.name;
      const effect = document.createElement("span");
      effect.className = "effect";
      effect.textContent = n.effects.map(describe).join(", ") + (reachable || owned ? "" : " · braucht Vorgänger");
      li.append(name, b, effect);
      return li;
    }),
  );
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
  const valid = hover ? canPlace(level, loadout.capacity, placements, hover) || placements.some((p) => p.x === hover!.x && p.y === hover!.y) : false;
  drawWorld(g, view, terrain, world, phase === "run" ? acc / DT : 1, now / 1000, {
    hover: hover && phase === "prepare" && loadout.unlocked ? { cell: hover, valid, range: loadout.turret.range } : undefined,
  });
  requestAnimationFrame(frame);
}

async function boot() {
  try {
    save = await loadSave();
  } catch (err) {
    // No server, or a save this build cannot read: play a fresh game but never write over the stored one.
    console.warn(err);
    save = emptySave();
    canStore = false;
    const el = $("save-state");
    el.textContent = "Spielstand nicht geladen – Fortschritt wird nicht gespeichert";
    el.classList.add("failed");
  }
  loadout = deriveLoadout(save.research);
  openLevel(Math.min(save.unlockedLevel, LEVELS.length - 1));
  if (!loadout.unlocked) {
    renderResearch();
    $("research").hidden = false;
  }
  requestAnimationFrame(frame);
}
void boot();
