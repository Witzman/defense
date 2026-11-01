/**
 * The research tree on a canvas (#7): the whole tree visible from the start, free pan and zoom, a fixed info
 * column beside it, and a purchase only after confirming there.
 */
import { applyMove, attachGestures } from "./gestures.ts";
import { ROOT, type Effect, type ResearchNode } from "../content/tree.ts";
import { TURRET_TYPES, turretType, type TurretKind } from "../content/turrets.ts";
import { canBuy, CATALOG, costOf } from "../game/research.ts";
import type { Save } from "../game/save.ts";

const CLUSTER_COLORS: Record<string, string> = {
  ...Object.fromEntries(TURRET_TYPES.map((t) => [t.id, t.color])),
  ballistics: "#c9ada7",
  thermal: "#ffb347",
  electrics: "#56cfe1",
  cooling: "#a0c4ff",
  optics: "#caffbf",
  logistics: "#ffd6a5",
  ability: "#f2c14e",
  bridge: "#8d99ae",
  start: "#edf2f4",
};
const GLOBAL_SYMBOLS: Record<string, string> = {
  ballistics: "⊕", thermal: "☀", electrics: "ϟ", cooling: "❆", optics: "◉", logistics: "▣", ability: "⌖", bridge: "⇄", start: "★",
};
const RADIUS: Record<ResearchNode["size"], number> = { start: 1.5, entry: 1.1, keystone: 1.25, notable: 0.75, synergy: 0.85, small: 0.38 };

type State = "owned" | "buyable" | "expensive" | "locked";

export interface TreeView {
  open(): void;
  refresh(): void;
}

export function createTreeView(canvas: HTMLCanvasElement, info: HTMLElement, getSave: () => Save, onBuy: (id: string) => void, fmt: Intl.NumberFormat): TreeView {
  const g = canvas.getContext("2d")!;
  const byId = new Map(CATALOG.map((n) => [n.id, n]));
  const edges: [ResearchNode, ResearchNode][] = [];
  for (const n of CATALOG) for (const l of n.links) if (n.id < l) edges.push([n, byId.get(l)!]);
  let scale = 10;
  let ox = 0;
  let oy = 0;
  let hovered: ResearchNode | undefined;
  let selected: ResearchNode | undefined;
  let dirty = true;
  const dpr = () => window.devicePixelRatio || 1;

  const owned = (id: string) => id === ROOT || getSave().research.includes(id);
  function state(n: ResearchNode): State {
    const s = getSave();
    if (owned(n.id)) return "owned";
    const reachable = n.links.some(owned) && (n.requiresAll ?? []).every(owned);
    if (!reachable) return "locked";
    return canBuy(s, n.id) ? "buyable" : "expensive";
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr()));
    canvas.height = Math.max(1, Math.round(r.height * dpr()));
    dirty = true;
  }

  function fit() {
    resize();
    const xs = CATALOG.map((n) => n.x);
    const ys = CATALOG.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + 6;
    const h = Math.max(...ys) - Math.min(...ys) + 6;
    scale = Math.min(canvas.width / w, canvas.height / h);
    ox = canvas.width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * scale;
    oy = canvas.height / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * scale;
  }

  const sx = (x: number) => ox + x * scale;
  const sy = (y: number) => oy + y * scale;

  function nodeAt(px: number, py: number): ResearchNode | undefined {
    let best: ResearchNode | undefined;
    let bestD = Infinity;
    for (const n of CATALOG) {
      const d = Math.hypot(sx(n.x) - px, sy(n.y) - py);
      const r = Math.max(6 * dpr(), RADIUS[n.size] * scale * 1.2);
      if (d < r && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function draw() {
    if (!dirty) return;
    dirty = false;
    g.fillStyle = "#0a1624";
    g.fillRect(0, 0, canvas.width, canvas.height);
    const states = new Map(CATALOG.map((n) => [n.id, state(n)]));
    // Edges: lit between owned nodes, faint elsewhere.
    g.lineWidth = Math.max(1, scale * 0.08);
    for (const lit of [false, true]) {
      g.strokeStyle = lit ? "rgba(242, 193, 78, 0.85)" : "rgba(140, 150, 175, 0.28)";
      g.beginPath();
      for (const [a, b] of edges) {
        if ((states.get(a.id) === "owned" && states.get(b.id) === "owned") !== lit) continue;
        g.moveTo(sx(a.x), sy(a.y));
        g.lineTo(sx(b.x), sy(b.y));
      }
      g.stroke();
    }
    for (const n of CATALOG) {
      const st = states.get(n.id)!;
      const color = CLUSTER_COLORS[n.cluster] ?? "#ccc";
      const r = Math.max(2 * dpr(), RADIUS[n.size] * scale);
      const x = sx(n.x);
      const y = sy(n.y);
      if (x < -r || y < -r || x > canvas.width + r || y > canvas.height + r) continue;
      g.globalAlpha = st === "locked" ? 0.35 : 1;
      g.fillStyle = st === "owned" ? color : "#13283a";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(1, r * (n.size === "keystone" ? 0.3 : 0.2));
      g.strokeStyle = st === "buyable" ? "#f2c14e" : st === "expensive" ? "rgba(242, 193, 78, 0.45)" : color;
      g.stroke();
      if (n.size === "keystone" || n.size === "start") {
        g.beginPath();
        g.arc(x, y, r * 1.35, 0, Math.PI * 2);
        g.stroke();
      }
      if (n === selected || n === hovered) {
        g.strokeStyle = "#ffffff";
        g.lineWidth = Math.max(1.5, r * 0.25);
        g.beginPath();
        g.arc(x, y, r * 1.6, 0, Math.PI * 2);
        g.stroke();
      }
      const symbol = symbolOf(n);
      if (symbol && r >= 7 * dpr() && n.size !== "small") {
        g.fillStyle = st === "owned" ? "#0a1624" : color;
        g.font = `${Math.round(r * 1.1)}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(symbol, x, y + r * 0.05);
      }
      g.globalAlpha = 1;
    }
  }

  function symbolOf(n: ResearchNode): string | undefined {
    if (TURRET_TYPES.some((t) => t.id === n.cluster)) return turretType(n.cluster as TurretKind).symbol;
    return GLOBAL_SYMBOLS[n.cluster];
  }

  function renderInfo() {
    const n = selected ?? hovered;
    const s = getSave();
    if (!n) {
      info.innerHTML = `<h3>Forschung</h3><p class="muted">Fahre über einen Knoten oder tippe ihn an. Kaufbar ist, was an Erforschtes grenzt (gelber Rand).</p>
        <p class="muted">${s.research.length} von ${CATALOG.length - 1} Knoten erforscht.</p>`;
      return;
    }
    const st = state(n);
    const cost = costOf(n, s.research);
    const needs = (n.requiresAll ?? []).filter((r) => !owned(r)).map((r) => byId.get(r)?.name ?? r);
    info.innerHTML = `<h3>${escape(n.name)}</h3>
      <ul class="effects">${summarize(n.effects).map((line) => `<li>${escape(line)}</li>`).join("") || "<li>Startpunkt</li>"}</ul>
      <p class="cost">${st === "owned" ? "erforscht" : `Kosten ◆ ${fmt.format(cost)}`}</p>
      ${needs.length ? `<p class="muted">Braucht zusätzlich: ${needs.map(escape).join(", ")}</p>` : ""}
      ${st === "locked" ? `<p class="muted">Noch nicht erreichbar: grenzt an keinen erforschten Knoten.</p>` : ""}
      ${st === "expensive" ? `<p class="muted">Dir fehlen ◆ ${fmt.format(cost - Math.floor(s.points))}.</p>` : ""}`;
    if (st === "buyable" && n === selected) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `Erforschen · ◆ ${fmt.format(cost)}`;
      b.addEventListener("click", () => {
        onBuy(n.id);
        dirty = true;
        renderInfo();
      });
      info.append(b);
    } else if (st === "buyable") {
      info.insertAdjacentHTML("beforeend", `<p class="muted">Antippen, um zu erforschen.</p>`);
    }
  }

  // Input: wheel or pinch zooms, drag pans, a tap selects.
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const px = ev.offsetX * dpr();
    const py = ev.offsetY * dpr();
    const k = Math.exp(-ev.deltaY * 0.0015);
    const next = Math.min(120, Math.max(3, scale * k));
    ox = px - (px - ox) * (next / scale);
    oy = py - (py - oy) * (next / scale);
    scale = next;
    dirty = true;
  }, { passive: false });
  attachGestures(canvas, {
    move(m) {
      const d = dpr();
      ({ scale, ox, oy } = applyMove({ scale, ox, oy }, { k: m.k, cx: m.cx * d, cy: m.cy * d, dx: m.dx * d, dy: m.dy * d }, 3, 120));
      dirty = true;
    },
    hover(p) {
      const n = p && nodeAt(p.x * dpr(), p.y * dpr());
      if (n !== hovered) {
        hovered = n;
        dirty = true;
        renderInfo();
      }
    },
    tap(p) {
      selected = nodeAt(p.x * dpr(), p.y * dpr());
      dirty = true;
      renderInfo();
    },
  });
  addEventListener("resize", () => {
    if (canvas.offsetParent) {
      resize();
    }
  });

  function loop() {
    if (canvas.offsetParent) draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  let fitted = false;
  return {
    open() {
      if (!fitted) {
        fit();
        fitted = true;
      } else resize();
      dirty = true;
      renderInfo();
    },
    refresh() {
      dirty = true;
      renderInfo();
    },
  };
}

/** A bonus as the player reads it: bonuses add up (#19), so ×1.04 is "+4 %", ×0.95 is "−5 %". */
function pct(mul: number): string {
  const p = Math.round((mul - 1) * 1000) / 10;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toLocaleString("de-DE")} %`;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Effects as lines; one effect repeated for many kinds becomes one line ("alle Geschütze" or a name list). */
export function summarize(effects: readonly Effect[]): string[] {
  const groups = new Map<string, { e: Effect; kinds: string[] }>();
  const lines: string[] = [];
  for (const e of effects) {
    if (!("turret" in e) || e.kind === "unlock") {
      lines.push(describe(e));
      continue;
    }
    const { turret, ...rest } = e;
    const key = JSON.stringify(rest);
    const g = groups.get(key) ?? { e, kinds: [] };
    g.kinds.push(turretType(turret).name);
    groups.set(key, g);
  }
  for (const { e, kinds } of groups.values()) {
    const text = describe(e).replace(/^[^:]+: /, "");
    if (kinds.length === 1) lines.push(`${kinds[0]}: ${text}`);
    else if (kinds.length === TURRET_TYPES.length) lines.push(`Alle Geschütze: ${text}`);
    else lines.push(`${kinds.join(", ")}: ${text}`);
  }
  return lines;
}

const PATTERN_FIELDS: Record<string, string> = {
  radius: "Wirkradius", burnSeconds: "Brenndauer (s)", jumps: "Sprünge", width: "Projektilbreite", factor: "Verlangsamung", seconds: "Dauer (s)", angle: "Kegelwinkel (°)",
};

export function describe(e: Effect): string {
  const name = "turret" in e ? turretType(e.turret).name : "";
  switch (e.kind) {
    case "unlock": return `schaltet ${name} frei`;
    case "capacity": return `${name}: +${e.add} Stück`;
    case "capacityMul": return `${name}: Anzahl ${pct(e.mul)}`;
    case "fireRate": return `${name}: Feuerrate ${pct(e.mul)}`;
    case "range": return `${name}: Reichweite +${e.add}`;
    case "damage": return `${name}: Schaden ${pct(e.mul)}`;
    case "turnRate": return `${name}: Schwenken ${pct(e.mul)}`;
    case "pattern": return `${name}: ${PATTERN_FIELDS[e.field]} +${e.add}`;
    case "abilityUnlock": return "Präzisionsschuss: Klick im Run trifft eine kleine Fläche";
    case "abilityDamage": return `Präzisionsschuss: Schaden ${pct(e.mul)}`;
    case "abilityRadius": return `Präzisionsschuss: Fläche +${e.add}`;
    case "abilityCooldown": return `Präzisionsschuss: Abklingzeit ${pct(e.mul)}`;
  }
}
