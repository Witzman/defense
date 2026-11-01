import { enemyType } from "../content/enemies.ts";
import { turretType, type TurretKind } from "../content/turrets.ts";
import type { Analysis, GoalLine } from "../game/stats.ts";
import { SAMPLE_TICKS } from "../sim/stats.ts";
import { DT } from "../sim/world.ts";
import { bindEnemyCard, type EnemyCard } from "./enemyCard.ts";

/** The run analysis on screen (#32): a compact line in the banner and the panel with all numbers. */

const fmt = new Intl.NumberFormat("de-DE");
const round = (n: number) => fmt.format(Math.round(n));

/** Goals carry the names the map gives them (#18). */
export const goalName = (i: number, goals: number) => (goals > 1 ? `Hafen ${i + 1}` : "Hafen");

const dot = (type: string) => {
  const t = enemyType(type);
  return `<span class="dot" style="background:${t.color};border-color:${t.edge}"></span>`;
};
const symbol = (kind: TurretKind) => {
  const t = turretType(kind);
  return `<span class="symbol" style="--kind:${t.color}">${t.symbol}</span>`;
};

/** The banner's compact lines: which goal fell or is weakest, who broke through, the best and the worst turret. */
export function summaryHtml(a: Analysis, goalEnergy: number): string {
  const n = a.goals.length;
  const worst = a.goals[a.worstGoal]!;
  const goal = worst.fell
    ? `${goalName(a.worstGoal, n)} gefallen`
    : `${n > 1 ? "schwächstes Ziel " : ""}${goalName(a.worstGoal, n)} bei ${Math.round((worst.left / goalEnergy) * 100)} %`;
  const through = a.topArrived.length
    ? `Durchbrüche ${a.topArrived.map((t) => `<span class="chip-inline" title="${enemyType(t.type).name}">${dot(t.type)}${fmt.format(t.arrived)}</span>`).join("")}`
    : "keine Durchbrüche";
  const turrets = a.best && a.worst && a.turrets.length > 1
    ? `Stärkstes ${symbol(a.best.kind)} ${fmt.format(a.best.kills)} · Schwächstes ${symbol(a.worst.kind)} ${fmt.format(a.worst.kills)}`
    : a.best
      ? `${symbol(a.best.kind)} ${fmt.format(a.best.kills)} besiegt`
      : "kein Geschütz";
  return `<span>${goal}</span><span>${through}</span><span>${turrets}</span>`;
}

function seconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Energy over time of one goal as a small area curve. */
export function curveSvg(g: GoalLine, goalEnergy: number): string {
  const W = 260;
  const H = 56;
  const n = g.samples.length;
  const pts = g.samples.map((v, i) => `${((i / Math.max(1, n - 1)) * W).toFixed(1)},${(H - (Math.max(0, v) / goalEnergy) * H).toFixed(1)}`);
  const line = pts.join(" ");
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Energie über die Zeit">`
    + `<line x1="0" y1="0.5" x2="${W}" y2="0.5" class="grid"/><line x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}" class="grid"/>`
    + `<polygon points="0,${H} ${line} ${W},${H}" class="area"/><polyline points="${line}" class="stroke" vector-effect="non-scaling-stroke"/></svg>`;
}

export function renderAnalysis(root: HTMLElement, a: Analysis, opts: { goalEnergy: number; kinds: () => readonly TurretKind[]; card: EnemyCard }) {
  const n = a.goals.length;
  const typeRows = a.types.map((t) => {
    const per = n > 1 ? ` title="${t.arrivedAt.map((v, i) => `${goalName(i, n)}: ${fmt.format(v)}`).join(" · ")}"` : "";
    return `<tr class="enemy-row" tabindex="0" data-type="${t.type}"><td>${dot(t.type)}${enemyType(t.type).name}</td>`
      + `<td>${fmt.format(t.spawned)}</td><td>${fmt.format(t.killed)}</td><td${per}>${fmt.format(t.arrived)}</td></tr>`;
  });
  const turrets = [...a.turrets].sort((p, q) => q.kills - p.kills || q.damage - p.damage);
  const turretRows = turrets.map((t) => `<tr><td>${symbol(t.kind)} ${turretType(t.kind).name}</td><td>${t.x + 1} / ${t.y + 1}</td>`
    + `<td>${fmt.format(t.kills)}</td><td>${round(t.damage)}</td></tr>`);
  const bucketRows = a.buckets.map((b) => `<tr class="bucket"><td>${b.name}</td><td></td><td>${fmt.format(b.kills)}</td><td>${round(b.damage)}</td></tr>`);
  const goals = a.goals.map((g, i) => {
    const pct = Math.max(0, Math.round((g.left / opts.goalEnergy) * 100));
    const secs = ((g.samples.length - 1) * SAMPLE_TICKS * DT);
    return `<figure class="goal"><figcaption>${goalName(i, n)} <b class="${g.fell ? "fell" : ""}">${g.fell ? "gefallen" : `${pct} %`}</b></figcaption>`
      + `${curveSvg(g, opts.goalEnergy)}<div class="axis"><span>0:00</span><span>${seconds(secs)}</span></div></figure>`;
  });
  root.innerHTML = `<h3>Gegner</h3><table class="numbers"><thead><tr><th>Art</th><th>erschienen</th><th>besiegt</th><th>durchgebrochen</th></tr></thead><tbody>${typeRows.join("")}</tbody></table>`
    + `<h3>Geschütze</h3><table class="numbers"><thead><tr><th>Geschütz</th><th>Feld</th><th>besiegt</th><th>Schaden</th></tr></thead><tbody>${turretRows.join("") || `<tr><td colspan="4" class="muted">Kein Geschütz gesetzt.</td></tr>`}${bucketRows.join("")}</tbody></table>`
    + `<h3>Energie der Ziele</h3><div class="goals">${goals.join("")}</div>`;
  for (const row of root.querySelectorAll<HTMLElement>(".enemy-row")) {
    const t = a.types.find((x) => x.type === row.dataset.type)!;
    bindEnemyCard(opts.card, row, () => ({
      type: t.type,
      kinds: opts.kinds(),
      lines: [`${fmt.format(t.spawned)} erschienen`, `${fmt.format(t.killed)} besiegt`, `${fmt.format(t.arrived)} durchgebrochen`],
    }));
  }
}
