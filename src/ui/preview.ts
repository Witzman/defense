import { enemyType } from "../content/enemies.ts";
import type { TurretKind } from "../content/turrets.ts";
import type { View } from "../render/canvas.ts";
import type { LevelDef } from "../sim/world.ts";
import { bindEnemyCard, type EnemyCard } from "./enemyCard.ts";

/**
 * Enemy preview (#31): in preparation each spawn shows a row of chips, one per group that flows out of it — the
 * type's colour, how many, and from when. A chip opens the enemy card.
 */

export interface Chip {
  type: string;
  count: number;
  /** Seconds after the run starts. */
  start: number;
}

/** Chips per spawn index, in the order of the level's groups. */
export function spawnChips(level: LevelDef): Chip[][] {
  const out: Chip[][] = level.map.spawns.map(() => []);
  for (const g of level.enemies.groups) {
    const at = g.spawn ?? 0;
    (out[at] ?? out[0]!).push({ type: g.type, count: g.count, start: g.start ?? 0 });
  }
  return out;
}

/** "ab 0:20"; nothing for a group that flows from the start. */
export function startLabel(seconds: number): string {
  if (seconds <= 0) return "";
  const s = Math.round(seconds);
  return `ab ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const fmt = new Intl.NumberFormat("de-DE");
/** Floating glass the chips keep clear of. */
const OBSTACLES = ["hud", "hint", "bar", "tools", "banner"];

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Preview {
  /** Builds the chips for a level. */
  open(level: LevelDef): void;
  /** Places the rows under their spawns for this frame's camera; hides them when not `visible`. */
  place(view: View, dpr: number, visible: boolean): void;
}

export function createPreview(card: EnemyCard, kinds: () => readonly TurretKind[]): Preview {
  const host = document.createElement("div");
  host.id = "preview";
  // Right above the map, under HUD, bar, banner and panels.
  const map = document.getElementById("game");
  if (map) map.after(host);
  else document.body.append(host);
  let rows: HTMLElement[] = [];
  let level: LevelDef | undefined;
  let shown = true;
  return {
    open(l) {
      level = l;
      const many = l.map.spawns.length > 1;
      rows = spawnChips(l).map((chips, s) => {
        const row = document.createElement("div");
        row.className = "spawn-chips";
        for (const c of chips) {
          const t = enemyType(c.type);
          const b = document.createElement("button");
          b.type = "button";
          b.className = "spawn-chip";
          b.setAttribute("aria-label", `${t.name}: ${fmt.format(c.count)}${c.start ? `, ${startLabel(c.start)}` : ""}`);
          b.innerHTML = `<span class="dot" style="background:${t.color};border-color:${t.edge}"></span><b>${fmt.format(c.count)}</b>${c.start ? `<small>${startLabel(c.start)}</small>` : ""}`;
          bindEnemyCard(card, b, () => ({
            type: c.type,
            kinds: kinds(),
            lines: [`${fmt.format(c.count)} Gegner`, c.start ? startLabel(c.start) : "von Beginn an", many ? `Quelle ${s + 1}` : "Quelle"],
          }));
          row.append(b);
        }
        return row;
      });
      host.replaceChildren(...rows);
    },
    place(view, dpr, visible) {
      if (visible !== shown) {
        shown = visible;
        host.hidden = !visible;
        if (!visible && card.anchor && host.contains(card.anchor)) card.hide();
      }
      if (!visible || !level) return;
      // Clear of the spawn's outermost ring (render/canvas.ts: marker × 1.35) and of the floating glass (HUD, hint,
      // bar, tools, banner): below the spawn if that is free, else above, right, left or diagonal; failing all, where
      // the least is covered.
      const clear = (Math.max(view.scale, 8) * 1.4) / dpr + 4;
      const blocked: Rect[] = OBSTACLES.map((id) => document.getElementById(id)).filter((e) => e && !e.hidden).map((e) => e!.getBoundingClientRect());
      // The names of springs and harbours (#18) where labels.ts wants them: beside the marker, towards the middle.
      const map = level.map;
      const { width: W, height: H } = map;
      const places = [...map.spawns.map((p) => ({ p, n: map.spawns.length })), ...map.goals.map((p) => ({ p, n: map.goals.length }))];
      for (const { p, n } of places) {
        const lx = (view.ox + (p.x + 0.5 + (p.x > W / 2 ? -3 : 3)) * view.scale) / dpr;
        const ly = (view.oy + (p.y + 0.5 + (p.y > H / 2 ? -1.6 : 1.6)) * view.scale) / dpr;
        const half = (n > 1 ? 8 : 6) * 4.5 + 4;
        blocked.push({ left: lx - half, right: lx + half, top: ly - 10, bottom: ly + 10 });
      }
      level.map.spawns.forEach((p, i) => {
        const row = rows[i];
        if (!row) return;
        const w = row.offsetWidth;
        const h = row.offsetHeight;
        const sx = (view.ox + (p.x + 0.5) * view.scale) / dpr;
        const sy = (view.oy + (p.y + 0.5) * view.scale) / dpr;
        const spots = [
          { x: sx - w / 2, y: sy + clear },
          { x: sx - w / 2, y: sy - clear - h },
          { x: sx + clear, y: sy - h / 2 },
          { x: sx - clear - w, y: sy - h / 2 },
          { x: sx + clear, y: sy + clear },
          { x: sx - clear - w, y: sy + clear },
          { x: sx + clear, y: sy - clear - h },
          { x: sx - clear - w, y: sy - clear - h },
        ].map((q) => ({ x: Math.min(innerWidth - w - 8, Math.max(8, q.x)), y: Math.min(innerHeight - h - 8, Math.max(8, q.y)) }));
        const covered = (q: { x: number; y: number }) => blocked.reduce((a, r) =>
          a + Math.max(0, Math.min(q.x + w, r.right) - Math.max(q.x, r.left)) * Math.max(0, Math.min(q.y + h, r.bottom) - Math.max(q.y, r.top)), 0);
        let at = spots[0]!;
        let least = Infinity;
        for (const q of spots) {
          const c = covered(q);
          if (c < least) [at, least] = [q, c];
          if (c === 0) break;
        }
        row.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      });
    },
  };
}
