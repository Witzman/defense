// `BALANCE_FROM=0 BALANCE_TO=6 npx vitest run --config vitest.balance.config.ts test/balance/economy.run.ts`:
// the economy side of the criteria of #11, read off the presets the search wrote and the figures it stored.
// Per level: research owned on entry and its share of the tree (criterion 6), points per minute against the best earlier
// level (criterion 5, from the search's diagnostics), and how many full clears buy the next five cheapest nodes.
import { it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BALANCE } from "../../src/content/balance.ts";
import { enemyCount, LEVELS } from "../../src/content/levels.ts";
import { runPoints } from "../../src/game/points.ts";
import { CATALOG, costOf } from "../../src/game/research.ts";
import type { Save } from "../../src/game/save.ts";
import { ROOT } from "../../src/content/tree.ts";

const FROM = Number(process.env.BALANCE_FROM ?? 0);
const TO = Number(process.env.BALANCE_TO ?? 6);

interface Stored { levelHp: Record<string, number>; levelKillValue: Record<string, number>; levels: Record<string, { failures: Record<string, number>; diag?: { seconds: number; jamShare: number; pointsPerMinute: number; bestEarlierPerMinute: number } }> }

it("economy of the levels", () => {
  const state = JSON.parse(readFileSync("balance/search.json", "utf8")) as Stored;
  for (const [k, v] of Object.entries(state.levelHp)) BALANCE.levelHp[Number(k)] = v;
  for (const [k, v] of Object.entries(state.levelKillValue)) BALANCE.levelKillValue[Number(k)] = v;
  const rows = ["| Level | Fehlversuche | Knoten bei Eintritt | Baumanteil | Punkte je Vollsieg | 5 nächste Knoten in Vollsiegen | Punkte/min | beste frühere | Dauer | Stau |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (let i = FROM; i < TO; i++) {
    const f = `balance/presets/L${i + 1}-generalist.json`;
    if (!existsSync(f)) continue;
    const save = JSON.parse(readFileSync(f, "utf8")) as Save;
    const n = enemyCount(LEVELS[i]!());
    const clear = runPoints(i, n, n);
    const owned = new Set([ROOT, ...save.research]);
    const price = CATALOG.filter((x) => !owned.has(x.id) && x.links.some((l) => owned.has(l)) && (x.requiresAll ?? []).every((r) => owned.has(r)))
      .map((x) => costOf(x, save.research)).sort((a, b) => a - b).slice(0, 5);
    const need = price.reduce((a, b) => a + b, 0);
    const runs = need / Math.max(1, clear);
    const s = state.levels[String(i)];
    const d = s?.diag;
    rows.push(`| ${i + 1} | ${s ? JSON.stringify(s.failures) : "-"} | ${save.research.length} | ${(100 * save.research.length / CATALOG.length).toFixed(0)} % | ${Math.round(clear)} | ${runs.toFixed(1)} | ${d ? Math.round(d.pointsPerMinute) : "-"} | ${d ? Math.round(d.bestEarlierPerMinute) : "-"} | ${d ? Math.round(d.seconds) + " s" : "-"} | ${d ? (100 * d.jamShare).toFixed(0) + " %" : "-"} |`);
  }
  const md = rows.join("\n") + "\n";
  writeFileSync("balance/economy.md", md);
  process.stdout.write(md);
}, 600_000);
