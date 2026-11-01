import { enemyCount, LEVELS } from "./content/levels.ts";
import { TURRET_TYPES, turretType, type TurretKind } from "./content/turrets.ts";
import { createSaver, loadSave } from "./game/api.ts";
import { runPoints } from "./game/points.ts";
import { buy, canBuy, deriveArsenal } from "./game/research.ts";
import { createTreeView } from "./ui/treeView.ts";
import { applyMove, attachGestures, type Pt } from "./ui/gestures.ts";
import { emptySave, recordRun, setPlacements, type Save } from "./game/save.ts";
import type { Point } from "./sim/map.ts";
import { canPlace, createWorld, DT, remaining, step, useAbility, type Arsenal, type LevelDef, type Placement, type World } from "./sim/world.ts";
import { createScene, drawWorld, fitView, screenToCell, zoomAt, Trail, type Scene, type View } from "./render/canvas.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const g = canvas.getContext("2d")!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const startButton = $<HTMLButtonElement>("start");
const nextButton = $<HTMLButtonElement>("next");
const banner = $("banner");
const hint = $("hint");
const dpr = () => window.devicePixelRatio || 1;
const fmt = new Intl.NumberFormat("de-DE");

/** Swivel arcs the player cycles through, in degrees. */
const ARCS = [360, 180, 120, 90, 60];

let save: Save = emptySave();
let arsenal: Arsenal = { turrets: {} };
let levelIndex = 0;
let level: LevelDef;
let total = 0;
let placements: Placement[] = [];
let selected: TurretKind | undefined;
/** Facing and arc for the next turret placed; the last one set carries over. */
let draft = { facing: 0, arc: 360 };
let world: World;
let phase: "prepare" | "run" | "over" = "prepare";
let attempt = 0;
let cursor: Point | undefined;
let view: View;
let fitted: View;
let scene: Scene;
const trail = new Trail();

const saver = createSaver((state) => {
  const el = $("save-state");
  el.textContent = state === "saved" ? "gespeichert" : state === "saving" ? "speichert …" : "nicht gespeichert – neuer Versuch";
  el.classList.toggle("failed", state === "failed");
});
/** False when the stored game could not be read: then nothing is written, so a broken load never overwrites it. */
let canStore = true;
function commit(next: Save) {
  save = next;
  arsenal = deriveArsenal(save.research);
  if (!selected || !arsenal.turrets[selected]) selected = unlockedKinds()[0];
  if (canStore) saver.save(save);
  renderPalette();
  updateHud();
  if (level) renderTools();
}

const unlockedKinds = () => TURRET_TYPES.map((t) => t.id).filter((k) => arsenal.turrets[k]);

function rebuildWorld() {
  world = createWorld(level, arsenal, placements, attempt + 1);
}

function openLevel(i: number) {
  levelIndex = i;
  level = LEVELS[i]!();
  total = enemyCount(level);
  // Keep only placements that still fit the map and the research.
  placements = [];
  for (const p of save.levels[i]?.placements ?? []) if (canPlace(level, arsenal, placements, p)) placements.push(p);
  attempt = 0;
  picked = undefined;
  scene = createScene(level.map);
  renderPalette(); // its rows decide how much room the map gets
  fit();
  $("level").textContent = String(i + 1);
  prepare();
}

/** Camera that shows the whole lake between HUD and bar. */
function fit() {
  canvas.width = Math.round(innerWidth * dpr());
  canvas.height = Math.round(innerHeight * dpr());
  // Room for HUD (top), bar (bottom, one or two rows) and the tool column (right; mirrored left so the lake stays centred).
  const d = dpr();
  const side = 76 * d;
  const top = ($("hud").getBoundingClientRect().bottom + 8) * d;
  const bottom = (innerHeight - $("bar").getBoundingClientRect().top + 8) * d;
  fitted = fitView(level.map, canvas.width - 2 * side, canvas.height - top - bottom);
  fitted.ox += side;
  fitted.oy += top;
  view = { ...fitted };
}
addEventListener("resize", () => level && fit());

function prepare() {
  phase = "prepare";
  rebuildWorld();
  trail.clear();
  banner.hidden = true;
  nextButton.hidden = true;
  startButton.textContent = "Run starten";
  startButton.disabled = false;
  renderPalette();
  updateHud();
  renderTools();
}

startButton.addEventListener("click", () => {
  if (phase === "prepare") {
    attempt++;
    world = createWorld(level, arsenal, placements, attempt);
    phase = "run";
    startButton.disabled = true;
    closePanels();
    renderTools();
    commit(setPlacements(save, levelIndex, placements));
  } else if (phase === "over") {
    prepare();
  }
});
nextButton.addEventListener("click", () => openLevel(levelIndex + 1));

const toCell = (p: Pt) => screenToCell(view, p.x * dpr(), p.y * dpr());
const toMap = (p: Pt) => ({ x: (p.x * dpr() - view.ox) / view.scale, y: (p.y * dpr() - view.oy) / view.scale });
const placedAt = (c: Point) => placements.findIndex((p) => p.x === c.x && p.y === c.y);
/** Touch has no hover (#15): a tapped turret is picked, and the turret tools turn, narrow or remove it. */
let picked: Placement | undefined;
const coarse = matchMedia("(pointer: coarse)").matches;

// Camera: wheel or pinch zooms, dragging pans; a press without movement is a tap.
canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  view = zoomAt(view, ev.clientX * dpr(), ev.clientY * dpr(), Math.exp(-ev.deltaY * 0.0015), fitted.scale * 0.5, 64 * dpr());
}, { passive: false });
attachGestures(canvas, {
  move(m) {
    const d = dpr();
    view = applyMove(view, { k: m.k, cx: m.cx * d, cy: m.cy * d, dx: m.dx * d, dy: m.dy * d }, fitted.scale * 0.5, 64 * d);
    cursor = undefined;
  },
  hover(p) {
    cursor = p && toCell(p);
  },
  tap(p, ev) {
    if (phase === "run") {
      const m = toMap(p);
      useAbility(world, m.x, m.y);
      return;
    }
    if (phase !== "prepare") return;
    const touch = ev.pointerType !== "mouse";
    const cell = toCell(p);
    const i = placedAt(cell);
    if (i >= 0 && touch) {
      picked = picked === placements[i] ? undefined : placements[i];
    } else if (i >= 0) {
      if (placements[i] === picked) picked = undefined;
      placements.splice(i, 1);
    } else if (selected && canPlace(level, arsenal, placements, { ...cell, kind: selected })) {
      const placed: Placement = { ...cell, kind: selected, ...draft };
      placements.push(placed);
      if (touch) picked = placed;
    } else {
      picked = undefined;
      renderTools();
      return;
    }
    rebuildWorld();
    renderPalette();
    updateHud();
    renderTools();
  },
});

/** What the turret tools act on: the picked turret, else the next one placed. */
const toolTarget = (): { facing?: number; arc?: number } => (picked && placements.includes(picked) ? picked : draft);
function turn(t: { facing?: number; arc?: number }, by: number) {
  t.facing = ((((t.facing ?? 0) + by) % 360) + 360) % 360;
  toolDone(t);
}
function narrow(t: { facing?: number; arc?: number }) {
  t.arc = ARCS[(ARCS.indexOf(t.arc ?? 360) + 1) % ARCS.length];
  toolDone(t);
}
function toolDone(t: { facing?: number; arc?: number }) {
  if (t !== draft) draft = { facing: t.facing ?? 0, arc: t.arc ?? 360 };
  rebuildWorld();
  renderTools();
}
function renderTools() {
  const show = phase === "prepare" && unlockedKinds().length > 0;
  $("turret-tools").hidden = !show;
  if (!show) return;
  const t = toolTarget();
  $("tools-label").textContent = t === draft ? "Neues" : "Gewählt";
  $("arc").textContent = `${t.arc ?? 360}°`;
  $<HTMLButtonElement>("remove").disabled = t === draft;
}
$("turn-left").addEventListener("click", () => phase === "prepare" && turn(toolTarget(), -45));
$("turn-right").addEventListener("click", () => phase === "prepare" && turn(toolTarget(), 45));
$("arc").addEventListener("click", () => phase === "prepare" && narrow(toolTarget()));
$("remove").addEventListener("click", () => {
  const i = picked ? placements.indexOf(picked) : -1;
  if (phase !== "prepare" || i < 0) return;
  placements.splice(i, 1);
  picked = undefined;
  rebuildWorld();
  renderPalette();
  updateHud();
  renderTools();
});
$("fit").addEventListener("click", () => (view = { ...fitted }));
if (coarse) document.querySelector("#research .legend")!.textContent = "Zwei Finger zoomen · Ziehen verschiebt · gelber Rand = kaufbar";
// Safari zooms the whole page on a pinch unless told not to.
document.addEventListener("gesturestart", (ev) => ev.preventDefault());

/** R turns the turret under the cursor (or the picked one, or the next one placed) by 45°, A narrows its swivel arc. */
addEventListener("keydown", (ev) => {
  if (ev.key === "0" || ev.key === "Home") view = { ...fitted };
  if (ev.key === "Escape") closePanels();
  if (phase !== "prepare") return;
  const key = ev.key.toLowerCase();
  if (key !== "r" && key !== "a") return;
  const i = cursor ? placedAt(cursor) : -1;
  const target = i >= 0 ? placements[i]! : toolTarget();
  if (key === "r") turn(target, ev.shiftKey ? -45 : 45);
  else narrow(target);
});
// Number keys pick a turret kind from the bar.
addEventListener("keydown", (ev) => {
  const n = Number(ev.key);
  if (phase === "prepare" && n >= 1 && n <= 9) {
    const k = unlockedKinds()[n - 1];
    if (k) {
      selected = k;
      renderPalette();
    }
  }
});

function renderPalette() {
  const kinds = unlockedKinds();
  $("palette").replaceChildren(
    ...kinds.map((k, i) => {
      const t = turretType(k);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot" + (k === selected ? " selected" : "");
      b.title = `${t.name} (${i + 1}) – Klick auf Land setzt, Klick auf ein Geschütz entfernt, R dreht, A ändert den Schwenkbereich`;
      b.style.setProperty("--kind", t.color);
      const used = placements.filter((p) => p.kind === k).length;
      b.innerHTML = `<span class="symbol">${t.symbol}</span><span>${used}/${arsenal.turrets[k]!.capacity}</span>`;
      b.addEventListener("click", () => {
        selected = k;
        renderPalette();
      });
      return b;
    }),
  );
}

function updateHud() {
  if (!world) return;
  $("remaining").textContent = fmt.format(remaining(world));
  // One goal: its share. Several: each one, and the bar shows the weakest — that is the one that loses the run.
  const pcts = world.energies.map((e) => Math.max(0, Math.round((e / level.goalEnergy) * 100)));
  $("energy").textContent = pcts.length === 1 ? `${pcts[0]} %` : `${pcts.join(" · ")} %`;
  $("energy-fill").style.width = `${Math.min(...pcts)}%`;
  $("points").textContent = fmt.format(Math.floor(save.points));
  $("research-points").textContent = fmt.format(Math.floor(save.points));
  const ability = $("ability");
  ability.hidden = !arsenal.ability || phase !== "run";
  if (arsenal.ability && phase === "run") {
    const wait = Math.max(0, (world.abilityReadyTick - world.tick) * DT);
    ability.textContent = wait > 0 ? `Präzisionsschuss ${wait.toFixed(1)} s` : `Präzisionsschuss bereit – ${coarse ? "Tippen" : "Klick"} ins Wasser`;
    ability.classList.toggle("ready", wait === 0);
  }
  const noTurret = unlockedKinds().length === 0;
  hint.hidden = !(phase === "prepare" && (noTurret || placements.length === 0));
  hint.textContent = noTurret
    ? "Noch kein Geschütz – erforsche zuerst eins."
    : coarse
      ? "Tippen auf Land setzt ein Geschütz · antippen wählt es · rechts drehen, Bereich, entfernen · zwei Finger zoomen"
      : "Klick auf Land setzt ein Geschütz · R dreht · A ändert den Schwenkbereich · 1–9 wählt die Art";
}

function finish() {
  phase = "over";
  const won = world.status === "won";
  const earned = runPoints(levelIndex, world.killed, total);
  commit(recordRun(save, levelIndex, { status: won ? "won" : "lost", killed: world.killed, total, perfect: world.perfect }, LEVELS.length));
  const pct = Math.round((Math.min(...world.energies) / level.goalEnergy) * 100);
  banner.innerHTML = won
    ? `${world.perfect ? "Perfect Clear" : "Sieg"}<small>${world.energies.length > 1 ? "schwächstes Ziel" : "Ziel"} bei ${pct} % · +${fmt.format(earned)} ◆</small>`
    : `Niederlage<small>${fmt.format(world.killed)} von ${fmt.format(total)} besiegt · +${fmt.format(earned)} ◆</small>`;
  banner.hidden = false;
  startButton.textContent = "Nächster Run";
  startButton.disabled = false;
  nextButton.hidden = !(won && levelIndex + 1 < LEVELS.length);
  renderTools();
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
  $("research").hidden = false;
  renderResearch();
});

/** Starts over from an empty save: research, points, levels and placements are gone. Asks first. */
$("new-game").addEventListener("click", () => {
  if (phase === "run") return;
  if (!confirm("Neues Spiel starten? Forschung, Punkte, Level und Aufstellungen werden gelöscht.")) return;
  closePanels();
  selected = undefined;
  draft = { facing: 0, arc: 360 };
  commit(emptySave());
  openLevel(0);
  if (unlockedKinds().length === 0) {
    $("research").hidden = false;
    renderResearch();
  }
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

const tree = createTreeView($<HTMLCanvasElement>("tree"), $("node-info"), () => save, (id) => {
  if (!canBuy(save, id)) return;
  commit(buy(save, id));
  if (phase === "prepare") rebuildWorld();
}, fmt);

function renderResearch() {
  $("research-points").textContent = fmt.format(Math.floor(save.points));
  tree.open();
}

/** Game time per real second during a run. Owner, 2026-10-31: runs felt 10–20 % too slow. Changes only the pace, not
 * the balance: the simulation still steps in fixed DT. */
const GAME_SPEED = 1.15;

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (phase === "run") {
    acc += elapsed * GAME_SPEED;
    while (acc >= DT && world.status === "running") {
      step(world);
      trail.push(world.shots);
      acc -= DT;
    }
    updateHud();
    if (world.status !== "running") finish();
  }
  let hover;
  if (cursor && phase === "prepare") {
    const i = placedAt(cursor);
    if (i >= 0) {
      const p = placements[i]!;
      hover = { placement: p, valid: true, range: arsenal.turrets[p.kind]!.stats.range, existing: true };
    } else if (selected) {
      const p: Placement = { ...cursor, kind: selected, ...draft };
      hover = { placement: p, valid: canPlace(level, arsenal, placements, p), range: arsenal.turrets[selected]!.stats.range, existing: false };
    }
  }
  if (!hover && picked && phase === "prepare" && placements.includes(picked)) {
    hover = { placement: picked, valid: true, range: arsenal.turrets[picked.kind]!.stats.range, existing: true };
  }
  drawWorld(g, view, scene, world, phase === "run" ? acc / DT : 1, now / 1000, { hover, arcs: phase === "prepare", trail });
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
  arsenal = deriveArsenal(save.research);
  selected = unlockedKinds()[0];
  openLevel(Math.min(save.unlockedLevel, LEVELS.length - 1));
  if (unlockedKinds().length === 0) {
    $("research").hidden = false;
    renderResearch();
  }
  requestAnimationFrame(frame);
}
void boot();
