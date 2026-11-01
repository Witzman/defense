import { DAMAGE_TYPES, ENEMY_TYPES, enemyType, SHIELD_BREAKER, vulnerability, type DamageType, type EnemyType } from "../content/enemies.ts";
import { turretType, type TurretKind } from "../content/turrets.ts";

/**
 * The enemy card (#31, #32): what a type is and which of the player's turrets work against it. One card for the
 * preview at the spawns and for the run analysis.
 */

export const DAMAGE_NAMES: Record<DamageType, string> = {
  kinetic: "Kinetisch",
  explosive: "Explosiv",
  fire: "Feuer",
  energy: "Energie",
  electric: "Elektrisch",
};

/** Share of damage that reaches the enemy from which a turret counts as working well, and up to which badly. */
export const WORKS_WELL = 0.8;
export const WORKS_BADLY = 0.5;

export interface Verdict {
  kind: TurretKind;
  /** Effective share of a shot that counts, shields included; 0 when the turret cannot touch the type at all. */
  share: number;
  rating: "good" | "bad" | "fair";
  note?: string;
}

export interface EnemyFacts {
  type: EnemyType;
  /** Hit points and shield per member, relative to the Grünling (1). */
  hp: number;
  shield: number;
  speed: string;
  depth: string;
  /** Damage types it resists, with the share it ignores (1 = immune). */
  resist: { type: DamageType; share: number }[];
  immune: string[];
  verdicts: Verdict[];
}

const BASE_HP = enemyType("green").hp;

export function speedWord(speed: number): string {
  return speed <= 0.7 ? "langsam" : speed < 0.95 ? "etwas langsam" : speed <= 1.05 ? "normal" : "schnell";
}

/** The depth preference of #27 in words. */
export function depthWord(preference: number): string {
  return preference <= 0 ? "nimmt Abkürzungen am Ufer" : preference < 2 ? "hält Abstand zum Ufer" : "bleibt tief";
}

/** How well one turret kind works against a type. The laser's contact kill cannot target the instant-kill immune. */
export function verdict(t: EnemyType, kind: TurretKind): Verdict {
  const tt = turretType(kind);
  if (tt.pattern.kind === "beam" && t.instantKillImmune) return { kind, share: 0, rating: "bad", note: "zielt nicht" };
  const v = vulnerability(t, tt.damageType);
  if (v === 0) return { kind, share: 0, rating: "bad", note: "immun" };
  let share = v;
  let note: string | undefined;
  // Electric damage counts several times on a shield; shields are most of what a shielded type has.
  if (t.shield > 0 && tt.damageType === "electric") {
    share = (v * (t.shield * SHIELD_BREAKER + t.hp)) / (t.shield + t.hp);
    note = `Schild ×${SHIELD_BREAKER}`;
  }
  const rating = share >= WORKS_WELL ? "good" : share <= WORKS_BADLY ? "bad" : "fair";
  if (!note && v < 1) note = `${Math.round(v * 100)} %`;
  return { kind, share, rating, note };
}

export function enemyFacts(t: EnemyType, kinds: readonly TurretKind[]): EnemyFacts {
  const resist = DAMAGE_TYPES.filter((d) => vulnerability(t, d) < 1).map((d) => ({ type: d, share: 1 - vulnerability(t, d) }));
  const immune = resist.filter((r) => r.share >= 1).map((r) => `${DAMAGE_NAMES[r.type]}schaden`);
  if (t.instantKillImmune) immune.push("Sofort-Kill (Laser)");
  return {
    type: t,
    hp: t.hp / BASE_HP,
    shield: t.shield / BASE_HP,
    speed: speedWord(t.speed),
    depth: depthWord(t.depthPreference),
    resist: resist.filter((r) => r.share < 1),
    immune,
    verdicts: kinds.map((k) => verdict(t, k)),
  };
}

// --- the card on screen ----------------------------------------------------------------------------------------

const MAX_TOUGH = Math.max(...ENEMY_TYPES.map((e) => e.hp + e.shield));
const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function cardHtml(f: EnemyFacts, lines: readonly string[]): string {
  const t = f.type;
  const bar = (v: number, cls: string) => `<span class="meter"><span class="${cls}" style="width:${Math.round((v / MAX_TOUGH) * 100)}%"></span></span>`;
  const rows = [
    `<dt>Leben</dt><dd>${bar(f.hp, "hp")}${num.format(f.hp)}×</dd>`,
    f.shield > 0 ? `<dt>Schild</dt><dd>${bar(f.shield, "shield")}${num.format(f.shield)}×</dd>` : "",
    `<dt>Tempo</dt><dd>${f.speed}</dd>`,
    `<dt>Weg</dt><dd>${f.depth}</dd>`,
    f.resist.length ? `<dt>Resistenz</dt><dd>${f.resist.map((r) => `${DAMAGE_NAMES[r.type]} −${Math.round(r.share * 100)} %`).join(", ")}</dd>` : "",
    f.immune.length ? `<dt>Immun</dt><dd>${f.immune.join(", ")}</dd>` : "",
  ].join("");
  // Grouped by how well they work, so the answer to "what do I build against it" is one line each.
  const groups = (["good", "fair", "bad"] as const).map((rating) => {
    const vs = f.verdicts.filter((v) => v.rating === rating);
    if (!vs.length) return "";
    const head = rating === "good" ? "✔ wirkt gut" : rating === "bad" ? "✖ wirkt schlecht" : "– mittel";
    const items = vs.map((v) => {
      const tt = turretType(v.kind);
      return `<span class="kind"><span class="symbol" style="--kind:${tt.color}">${tt.symbol}</span>${esc(tt.name)}${v.note ? ` <small>${esc(v.note)}</small>` : ""}</span>`;
    });
    return `<li class="${rating}"><b>${head}</b>${items.join("")}</li>`;
  }).join("");
  return `<h3><span class="dot" style="background:${t.color};border-color:${t.edge}"></span>${esc(t.name)}</h3>`
    + (lines.length ? `<p class="facts">${lines.map(esc).join(" · ")}</p>` : "")
    + `<dl>${rows}</dl>`
    + (groups ? `<ul class="verdicts">${groups}</ul>` : `<p class="muted">Noch kein Geschütz erforscht.</p>`);
}

export interface EnemyCard {
  /** Shows the card for a type beside an element; `lines` are extras such as count and start. */
  show(anchor: Element, typeId: string, kinds: readonly TurretKind[], lines?: readonly string[]): void;
  hide(): void;
  /** The element the card is shown for, if any. */
  readonly anchor: Element | undefined;
}

export function createEnemyCard(): EnemyCard {
  const el = document.createElement("div");
  el.className = "enemy-card";
  el.hidden = true;
  el.setAttribute("role", "tooltip");
  document.body.append(el);
  let anchor: Element | undefined;
  // A touch anywhere else closes the card.
  document.addEventListener("pointerdown", (ev) => {
    const at = ev.target as Node;
    if (anchor && !anchor.contains(at) && !el.contains(at)) {
      anchor = undefined;
      el.hidden = true;
    }
  }, true);
  return {
    show(a, typeId, kinds, lines = []) {
      anchor = a;
      el.innerHTML = cardHtml(enemyFacts(enemyType(typeId), kinds), lines);
      el.hidden = false;
      // Beside the anchor: below if there is room, else above; always inside the window.
      const r = a.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      const top = r.bottom + 8 + h <= innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - 8 - h);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    },
    hide() {
      anchor = undefined;
      el.hidden = true;
    },
    get anchor() {
      return anchor;
    },
  };
}

/**
 * Opens the card on hover with a mouse and on a tap with a finger (tap again or elsewhere closes it).
 * `describe` gives the type and the extra lines at the moment it opens.
 */
export function bindEnemyCard(card: EnemyCard, target: HTMLElement, describe: () => { type: string; kinds: readonly TurretKind[]; lines?: readonly string[] }) {
  const open = () => {
    const d = describe();
    card.show(target, d.type, d.kinds, d.lines);
  };
  target.addEventListener("pointerenter", (ev) => ev.pointerType === "mouse" && open());
  target.addEventListener("pointerleave", (ev) => ev.pointerType === "mouse" && card.anchor === target && card.hide());
  target.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const mouse = (ev as PointerEvent).pointerType === "mouse";
    if (!mouse && card.anchor === target) card.hide();
    else open();
  });
}
