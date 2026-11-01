import { enemyCount, LEVELS } from "./content/levels.ts";
import { TURRET_TYPES, turretType, type TurretKind } from "./content/turrets.ts";
import { createSaver, exportName, exportText, importText, loadSave } from "./game/storage.ts";
import { runPoints } from "./game/points.ts";
import { buy, canBuy, deriveArsenal } from "./game/research.ts";
import { createTreeView } from "./ui/treeView.ts";
import { applyMove, attachGestures, type Pt } from "./ui/gestures.ts";
import { nextArc, spreadArc, turnedFacing } from "./ui/turretEdit.ts";
import { frameSteps, nextSpeed, parseSpeed, slotCount, type Speed } from "./ui/controls.ts";
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
let cursor: Point | undefined;
let view: View;
let fitted: View;
let scene: Scene;
const trail = new Trail();

const saver = createSaver((state) => {
  const el = $("save-state");
  el.textContent = state === "saved" ? "gespeichert" : "nicht gespeichert – Browser-Speicher voll oder gesperrt";
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
  world = createWorld(level, arsenal, placements);
}

function openLevel(i: number) {
  levelIndex = i;
  level = LEVELS[i]!();
  total = enemyCount(level);
  // Keep only placements that still fit the map and the research.
  placements = [];
  for (const p of save.levels[i]?.placements ?? []) if (canPlace(level, arsenal, placements, p)) placements.push(p);
  picked = undefined;
  scene = createScene(level.map, i);
  renderPalette();
  fit();
  $("level").textContent = String(i + 1);
  prepare();
}

/** Camera that shows the whole lake between HUD and bar. */
function fit() {
  canvas.width = Math.round(innerWidth * dpr());
  canvas.height = Math.round(innerHeight * dpr());
  // Room for HUD (top), bar (bottom, one row since #35) and the tool column (right; mirrored left so the lake stays centred).
  const d = dpr();
  const side = 76 * d;
  const top = ($("hud").getBoundingClientRect().bottom + 8) * d;
  const bottom = (innerHeight - $("bar").getBoundingClientRect().top + 8) * d;
  fitted = fitView(level.map, canvas.width - 2 * side, canvas.height - top - bottom);
  fitted.ox += side;
  fitted.oy += top;
  view = { ...fitted };
}
addEventListener("resize", () => {
  paletteFade();
  if (level) fit();
});

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
    world = createWorld(level, arsenal, placements);
    phase = "run";
    paused = false;
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
/**
 * A picked turret held by the fingers (#25): one finger moves it, two fingers set its arc (spread) and facing (turn).
 * `base` is where facing and arc stood when the fingers went down; `blocked` the cell under the finger it cannot take.
 */
let held: { base: { facing: number; arc: number }; blocked?: Point } | undefined;
/** The cell a tap just built on: a double tap there keeps the new turret instead of removing it. */
let builtByTap: Point | undefined;
const pickedNow = () => (phase === "prepare" && picked && placements.includes(picked) ? picked : undefined);
const nearPicked = (p: Pt, cells: number) => {
  const t = pickedNow();
  if (!t) return false;
  const m = toMap(p);
  return Math.hypot(m.x - (t.x + 0.5), m.y - (t.y + 0.5)) <= cells;
};
function hold(): true {
  const t = pickedNow()!;
  held = { base: { facing: t.facing ?? 0, arc: t.arc ?? 360 } };
  return true;
}
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
  // On the picked turret a finger grabs it at once; elsewhere on a turret, holding still picks and grabs it.
  grab: (p) => nearPicked(p, 0.75) && hold(),
  hold(p) {
    if (phase !== "prepare") return false;
    const i = placedAt(toCell(p));
    if (i < 0) return false;
    picked = placements[i];
    renderTools();
    updateHud();
    return hold();
  },
  grab2: (mid) => nearPicked(mid, 2) && hold(),
  drag(p) {
    const t = pickedNow();
    if (!t || !held) return;
    const cell = toCell(p);
    if (cell.x === t.x && cell.y === t.y) return (held.blocked = undefined);
    const others = placements.filter((q) => q !== t);
    if (canPlace(level, arsenal, others, { ...t, ...cell })) {
      t.x = cell.x;
      t.y = cell.y;
      held.blocked = undefined;
      rebuildWorld();
    } else held.blocked = cell;
  },
  twist(tw) {
    const t = pickedNow();
    if (!t || !held) return;
    t.facing = turnedFacing(held.base.facing, tw.rot);
    t.arc = spreadArc(held.base.arc, tw.k);
    rebuildWorld();
    renderTools();
  },
  release() {
    const t = pickedNow();
    held = undefined;
    if (t) toolDone(t);
  },
  tap(p, ev, count) {
    if (phase === "run") {
      const m = toMap(p);
      if (!paused) useAbility(world, m.x, m.y);
      return;
    }
    if (phase !== "prepare") return;
    const touch = ev.pointerType !== "mouse";
    const cell = toCell(p);
    const i = placedAt(cell);
    const rebuilt = builtByTap && builtByTap.x === cell.x && builtByTap.y === cell.y;
    builtByTap = undefined;
    if (touch && count === 2 && i >= 0) {
      // Double tap removes a turret; the second tap on one the first tap just built keeps it.
      if (rebuilt) return;
      if (placements[i] === picked) picked = undefined;
      placements.splice(i, 1);
    } else if (i >= 0 && touch) {
      picked = picked === placements[i] ? undefined : placements[i];
    } else if (i >= 0) {
      if (placements[i] === picked) picked = undefined;
      placements.splice(i, 1);
    } else if (selected && canPlace(level, arsenal, placements, { ...cell, kind: selected })) {
      const placed: Placement = { ...cell, kind: selected, ...draft };
      placements.push(placed);
      if (touch) {
        picked = placed;
        builtByTap = cell;
      }
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
  t.arc = nextArc(t.arc ?? 360);
  toolDone(t);
}
function toolDone(t: { facing?: number; arc?: number }) {
  if (t !== draft) draft = { facing: t.facing ?? 0, arc: t.arc ?? 360 };
  rebuildWorld();
  renderTools();
}
function renderTools() {
  renderRunTools();
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
  if (ev.key === " " && phase === "run") {
    // Space pauses; it must not also press the button that has the focus.
    ev.preventDefault();
    if (!ev.repeat) togglePause();
  }
  if (ev.key === "Escape") closePanels();
  if (phase !== "prepare") return;
  const key = ev.key.toLowerCase();
  if (key !== "r" && key !== "a") return;
  const i = cursor ? placedAt(cursor) : -1;
  const target = i >= 0 ? placements[i]! : toolTarget();
  if (key === "r") turn(target, ev.shiftKey ? -45 : 45);
  else narrow(target);
});
addEventListener("keyup", (ev) => ev.key === " " && phase === "run" && ev.preventDefault());
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

/** The bar keeps one row (#35): the kinds scroll sideways, by finger or wheel, and fade at an edge where more follows. */
const palette = $("palette");
/** The kind the palette last showed as selected: only a new selection scrolls the palette. */
let shownSelected: TurretKind | undefined;
function renderPalette() {
  const kinds = unlockedKinds();
  const scroll = palette.scrollLeft;
  palette.replaceChildren(
    ...kinds.map((k, i) => {
      const t = turretType(k);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot" + (k === selected ? " selected" : "");
      b.title = `${t.name} (${i + 1}) – Klick auf Land setzt, Klick auf ein Geschütz entfernt, R dreht, A ändert den Schwenkbereich`;
      b.style.setProperty("--kind", t.color);
      const used = placements.filter((p) => p.kind === k).length;
      b.innerHTML = `<span class="symbol">${t.symbol}</span><span>${slotCount(used, arsenal.turrets[k]!.capacity)}</span>`;
      b.addEventListener("click", () => {
        selected = k;
        renderPalette();
      });
      return b;
    }),
  );
  palette.scrollLeft = scroll;
  if (selected !== shownSelected) {
    shownSelected = selected;
    const b = palette.querySelector<HTMLElement>(".slot.selected");
    if (b) {
      // Into view with a slot's width to spare, so the neighbour that follows shows too.
      const pad = 24;
      const left = b.offsetLeft; // the palette is the slots' offset parent
      if (left - pad < palette.scrollLeft) palette.scrollLeft = left - pad;
      else if (left + b.offsetWidth + pad > palette.scrollLeft + palette.clientWidth)
        palette.scrollLeft = left + b.offsetWidth + pad - palette.clientWidth;
    }
  }
  paletteFade();
}
function paletteFade() {
  const max = palette.scrollWidth - palette.clientWidth;
  palette.classList.toggle("more-left", palette.scrollLeft > 1);
  palette.classList.toggle("more-right", palette.scrollLeft < max - 1);
}
palette.addEventListener("scroll", paletteFade, { passive: true });
// A mouse wheel turns into sideways scrolling; a trackpad's sideways swipe already scrolls.
palette.addEventListener("wheel", (ev) => {
  if (palette.scrollWidth <= palette.clientWidth || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
  ev.preventDefault();
  palette.scrollLeft += ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaY;
}, { passive: false });

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
  ability.hidden = !arsenal.ability || phase !== "run" || paused; // the pause hint takes its place
  if (arsenal.ability && phase === "run") {
    const wait = Math.max(0, (world.abilityReadyTick - world.tick) * DT);
    ability.textContent = wait > 0 ? `Präzisionsschuss ${wait.toFixed(1)} s` : `Präzisionsschuss bereit – ${coarse ? "Tippen" : "Klick"} ins Wasser`;
    ability.classList.toggle("ready", wait === 0);
  }
  const noTurret = unlockedKinds().length === 0;
  const editing = coarse && !!pickedNow();
  hint.hidden = !((phase === "prepare" && (noTurret || placements.length === 0 || editing)) || (phase === "run" && paused));
  hint.textContent = phase === "run"
    ? `Pause – ${coarse ? "▶ tippen" : "Leertaste oder ▶"} spielt weiter`
    : noTurret
    ? "Noch kein Geschütz – erforsche zuerst eins."
    : editing && placements.length > 0
      ? "Ziehen verschiebt · zwei Finger: spreizen = Bereich, drehen = Ausrichtung · Doppeltipp entfernt"
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

/** The save as a file (#24): the browser may clear its storage, and a file carries the game to another device. */
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([exportText(save)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const importInput = $<HTMLInputElement>("import-file");
$("import").addEventListener("click", () => phase !== "run" && importInput.click());
importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  let next: Save;
  try {
    next = importText(await file.text());
  } catch (err) {
    alert((err as Error).message);
    return;
  }
  if (!confirm("Spielstand aus der Datei laden? Der aktuelle Stand in diesem Browser wird ersetzt.")) return;
  canStore = true;
  $("save-state").classList.remove("failed");
  closePanels();
  selected = undefined;
  commit(next);
  openLevel(Math.min(save.unlockedLevel, LEVELS.length - 1));
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

/** Game time per real second during a run. Owner: +15 % on 2026-10-31, another +15 % on 2026-11-01 (#29). Changes only
 * the pace, not the balance: the simulation still steps in fixed DT. */
const GAME_SPEED = 1.15 * 1.15;

/** Run speed (#33): 1× is GAME_SPEED. The player's choice is kept across runs in the browser, not in the save game. */
const SPEED_KEY = "flow-defense/speed";
let speed: Speed = 1;
try {
  speed = parseSpeed(localStorage.getItem(SPEED_KEY));
} catch {
  // No storage: start at 1×.
}
let paused = false;
const speedButton = $<HTMLButtonElement>("speed");
const pauseButton = $<HTMLButtonElement>("pause");
function renderRunTools() {
  $("run-tools").hidden = phase !== "run";
  speedButton.textContent = `${speed}×`;
  speedButton.classList.toggle("on", speed === 2);
  speedButton.title = speed === 2 ? "Doppeltes Tempo – zurück auf 1×" : "Doppeltes Tempo";
  pauseButton.textContent = paused ? "▶" : "❚❚";
  pauseButton.classList.toggle("on", paused);
  pauseButton.title = paused ? "Weiter (Leertaste)" : "Pause (Leertaste)";
  pauseButton.setAttribute("aria-label", paused ? "Weiter" : "Pause");
  pauseButton.setAttribute("aria-pressed", String(paused));
}
function togglePause() {
  if (phase !== "run") return;
  paused = !paused;
  renderRunTools();
  updateHud();
}
speedButton.addEventListener("click", () => {
  speed = nextSpeed(speed);
  try {
    localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Not kept: the speed still applies to this session.
  }
  renderRunTools();
});
pauseButton.addEventListener("click", togglePause);

let last = performance.now();
let acc = 0;
/** Clock of time-driven effects (goal pulse, spawn rings): it stands still in a pause and runs faster at 2×. */
let fxTime = 0;
function frame(now: number) {
  const elapsed = (now - last) / 1000;
  last = now;
  if (phase === "run") {
    const r = frameSteps(acc, elapsed, GAME_SPEED * speed, paused, DT);
    acc = r.acc;
    for (let i = 0; i < r.steps && world.status === "running"; i++) {
      step(world);
      trail.push(world.shots);
    }
    if (!paused) fxTime += Math.min(0.25, elapsed) * speed;
    updateHud();
    if (world.status !== "running") finish();
  } else fxTime += Math.min(0.25, elapsed);
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
  if (held?.blocked && picked) {
    hover = { placement: { ...picked, ...held.blocked }, valid: false, range: 0, existing: true };
  } else if (!hover && picked && phase === "prepare" && placements.includes(picked)) {
    hover = { placement: picked, valid: true, range: arsenal.turrets[picked.kind]!.stats.range, existing: true };
  }
  drawWorld(g, view, scene, world, phase === "run" ? acc / DT : 1, fxTime, { hover, arcs: phase === "prepare", trail, dpr: dpr() });
  requestAnimationFrame(frame);
}

async function boot() {
  // Map lettering draws on the canvas, which never asks for a font itself: load Alegreya up front (#18).
  for (const f of ["500 13px Alegreya", "italic 500 16px Alegreya"]) void document.fonts?.load(f).catch(() => {});
  try {
    save = loadSave();
  } catch (err) {
    // No storage, or a save this build cannot read: play a fresh game but never write over the stored one.
    // Importing a file (campaign panel) writes again.
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
