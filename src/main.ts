import { enemyCount, LEVELS } from "./content/levels.ts";
import { TURRET_TYPES, turretType, type TurretKind } from "./content/turrets.ts";
import { createSaver, loadSave } from "./game/api.ts";
import { runPoints } from "./game/points.ts";
import { buy, canBuy, CATALOG, costOf, deriveArsenal, type Effect, type ResearchNode } from "./game/research.ts";
import { emptySave, recordRun, setPlacements, type Save } from "./game/save.ts";
import type { Point } from "./sim/map.ts";
import { canPlace, createWorld, DT, remaining, step, useAbility, type Arsenal, type LevelDef, type Placement, type World } from "./sim/world.ts";
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
  arsenal = deriveArsenal(save.research);
  if (!selected || !arsenal.turrets[selected]) selected = unlockedKinds()[0];
  if (canStore) saver.save(save);
  renderPalette();
  updateHud();
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
  rebuildWorld();
  banner.hidden = true;
  nextButton.hidden = true;
  startButton.textContent = "Run starten";
  startButton.disabled = false;
  renderPalette();
  updateHud();
}

startButton.addEventListener("click", () => {
  if (phase === "prepare") {
    attempt++;
    world = createWorld(level, arsenal, placements, attempt);
    phase = "run";
    startButton.disabled = true;
    closePanels();
    commit(setPlacements(save, levelIndex, placements));
  } else if (phase === "over") {
    prepare();
  }
});
nextButton.addEventListener("click", () => openLevel(levelIndex + 1));

const cellAtEvent = (ev: MouseEvent) => screenToCell(view, ev.clientX * dpr(), ev.clientY * dpr());
const mapAtEvent = (ev: MouseEvent) => ({ x: (ev.clientX * dpr() - view.ox) / view.scale, y: (ev.clientY * dpr() - view.oy) / view.scale });
const placedAt = (c: Point) => placements.findIndex((p) => p.x === c.x && p.y === c.y);

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
  cursor = drag?.moved ? undefined : cellAtEvent(ev);
});
canvas.addEventListener("pointerleave", () => (cursor = undefined));
canvas.addEventListener("pointerup", (ev) => {
  const wasDrag = drag?.moved;
  drag = undefined;
  if (wasDrag) return;
  if (phase === "run") {
    const p = mapAtEvent(ev);
    useAbility(world, p.x, p.y);
    return;
  }
  if (phase !== "prepare") return;
  const cell = cellAtEvent(ev);
  const i = placedAt(cell);
  if (i >= 0) placements.splice(i, 1);
  else if (selected && canPlace(level, arsenal, placements, { ...cell, kind: selected })) placements.push({ ...cell, kind: selected, ...draft });
  else return;
  rebuildWorld();
  renderPalette();
  updateHud();
});

/** R turns the turret under the cursor (or the next one placed) by 45°, A narrows its swivel arc. */
addEventListener("keydown", (ev) => {
  if (ev.key === "0" || ev.key === "Home") view = { ...fitted };
  if (ev.key === "Escape") closePanels();
  if (phase !== "prepare") return;
  const key = ev.key.toLowerCase();
  if (key !== "r" && key !== "a") return;
  const i = cursor ? placedAt(cursor) : -1;
  const target = i >= 0 ? placements[i]! : draft;
  if (key === "r") target.facing = (((target.facing ?? 0) + (ev.shiftKey ? -45 : 45)) % 360 + 360) % 360;
  else target.arc = ARCS[(ARCS.indexOf(target.arc ?? 360) + 1) % ARCS.length];
  if (i >= 0) draft = { facing: target.facing ?? 0, arc: target.arc ?? 360 };
  rebuildWorld();
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
  const pct = Math.max(0, Math.round((world.energy / level.goalEnergy) * 100));
  $("energy").textContent = `${pct} %`;
  $("energy-fill").style.width = `${pct}%`;
  $("points").textContent = fmt.format(Math.floor(save.points));
  $("research-points").textContent = fmt.format(Math.floor(save.points));
  const ability = $("ability");
  ability.hidden = !arsenal.ability || phase !== "run";
  if (arsenal.ability && phase === "run") {
    const wait = Math.max(0, (world.abilityReadyTick - world.tick) * DT);
    ability.textContent = wait > 0 ? `Präzisionsschuss ${wait.toFixed(1)} s` : "Präzisionsschuss bereit – Klick ins Wasser";
    ability.classList.toggle("ready", wait === 0);
  }
  const noTurret = unlockedKinds().length === 0;
  hint.hidden = !(phase === "prepare" && (noTurret || placements.length === 0));
  hint.textContent = noTurret
    ? "Noch kein Geschütz – erforsche zuerst eins."
    : "Klick auf Land setzt ein Geschütz · R dreht · A ändert den Schwenkbereich · 1–5 wählt die Art";
}

function finish() {
  phase = "over";
  const won = world.status === "won";
  const earned = runPoints(levelIndex, world.killed, total);
  commit(recordRun(save, levelIndex, { status: won ? "won" : "lost", killed: world.killed, total, perfect: world.perfect }, LEVELS.length));
  const pct = Math.round((world.energy / level.goalEnergy) * 100);
  banner.innerHTML = won
    ? `${world.perfect ? "Perfect Clear" : "Sieg"}<small>Ziel bei ${pct} % · +${fmt.format(earned)} ◆</small>`
    : `Niederlage<small>${fmt.format(world.killed)} von ${fmt.format(total)} besiegt · +${fmt.format(earned)} ◆</small>`;
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
    case "unlock": return `schaltet ${turretType(e.turret).name} frei`;
    case "capacity": return `+${e.add} ${turretType(e.turret).name}`;
    case "fireRate": return `Feuerrate ×${e.mul}`;
    case "range": return `Reichweite +${e.add}`;
    case "damage": return `Schaden ×${e.mul}`;
    case "turnRate": return `Schwenkgeschwindigkeit ×${e.mul}`;
    case "abilityUnlock": return "Klick im Run trifft eine kleine Fläche";
    case "abilityDamage": return `Schaden ×${e.mul}`;
    case "abilityRadius": return `Fläche +${e.add}`;
    case "abilityCooldown": return `Abklingzeit ×${e.mul}`;
  }
}

/** Branch a node belongs to, for grouping: the turret kind, or the ability. */
function branchOf(n: ResearchNode): string {
  return n.id.split("-")[0]!;
}

function renderResearch() {
  $("research-points").textContent = fmt.format(Math.floor(save.points));
  const branches = [...TURRET_TYPES.map((t) => t.id as string), "ability"];
  const sections = branches.map((b) => {
    const nodes = CATALOG.filter((n) => branchOf(n) === b);
    const owned = nodes.filter((n) => save.research.includes(n.id)).length;
    // Only what can be bought now (or soon): the owned and the far-off would bury it.
    const open = nodes.filter((n) => !save.research.includes(n.id) && n.requires.every((r) => save.research.includes(r)));
    const section = document.createElement("li");
    section.className = "branch";
    const t = b === "ability" ? undefined : turretType(b as TurretKind);
    const head = document.createElement("h3");
    head.innerHTML = `${t ? `<span class="symbol" style="color:${t.color}">${t.symbol}</span> ${t.name}` : "Präzisionsschuss"} <small>${owned}/${nodes.length} erforscht</small>`;
    const list = document.createElement("ul");
    list.replaceChildren(
      ...open.map((n) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `◆ ${fmt.format(costOf(n, save.research))}`;
        btn.disabled = !canBuy(save, n.id);
        btn.addEventListener("click", () => {
          if (!canBuy(save, n.id)) return;
          commit(buy(save, n.id));
          if (phase === "prepare") rebuildWorld();
          renderResearch();
        });
        const name = document.createElement("strong");
        name.textContent = n.name;
        const effect = document.createElement("span");
        effect.className = "effect";
        effect.textContent = n.effects.map(describe).join(", ");
        li.append(name, btn, effect);
        return li;
      }),
    );
    section.append(head, list);
    return section;
  });
  $("nodes").replaceChildren(...sections);
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
  drawWorld(g, view, terrain, world, phase === "run" ? acc / DT : 1, now / 1000, { hover, arcs: phase === "prepare" });
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
    renderResearch();
    $("research").hidden = false;
  }
  requestAnimationFrame(frame);
}
void boot();
