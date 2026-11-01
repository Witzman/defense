// `npm run balance:search`: the search of #11. Per level, ascending: try several corrections of the level's hit points
// in parallel (one process each), keep the one that puts the three profiles into the corridor, and hand the saves
// the winners bring out of the level on as the presets of the next one. Writes balance/presets/ and balance/search.json.
import { it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BALANCE } from "../../src/content/balance.ts";
import { emptySave, type Save } from "../../src/game/save.ts";
import { CORRIDOR, CORRIDOR_PROFILES, miss, type Job, type JobResult } from "../../src/balance/measure.ts";
import type { Profile } from "../../src/balance/strategies.ts";

const WORKERS = Number(process.env.BALANCE_WORKERS ?? 10);
const FROM = Number(process.env.BALANCE_FROM ?? 0);
const TO = Number(process.env.BALANCE_TO ?? 25);
const ROUNDS = Number(process.env.BALANCE_ROUNDS ?? 4);
const VARIANTS = Number(process.env.BALANCE_VARIANTS ?? 10);
const STATE = "balance/search.json";
const tmp = mkdtempSync(join(tmpdir(), "balance-"));
let seq = 0;

function runInProcess(job: Job): Promise<JobResult> {
  const id = seq++;
  const jobFile = join(tmp, `${id}.job.json`);
  const outFile = join(tmp, `${id}.out.json`);
  writeFileSync(jobFile, JSON.stringify(job));
  return new Promise((resolve, reject) => {
    const child = spawn("node_modules/.bin/vitest", ["run", "--config", "vitest.balance.config.ts", "test/balance/eval.run.ts"], {
      env: { ...process.env, BALANCE_JOB: jobFile, BALANCE_OUT: outFile },
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(readFileSync(outFile, "utf8"))) : reject(new Error(`job ${id} exited ${code}`))));
  });
}

async function pool(jobs: Job[]): Promise<JobResult[]> {
  const out: JobResult[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, jobs.length) }, async () => {
      while (next < jobs.length) {
        const k = next++;
        out[k] = await runInProcess(jobs[k]!);
      }
    }),
  );
  return out;
}

interface State {
  levelHp: Record<number, number>;
  /** Per level: factor, failures per profile, diagnostics of the generalist. */
  levels: Record<number, { factor: number; failures: Partial<Record<Profile, number>>; inCorridor: boolean; diag?: unknown }>;
}

const score = (rs: JobResult[]) => rs.reduce((s, r) => s + miss(r.profile, r.failures, r.won), 0);

it("balancing search", async () => {
  mkdirSync("balance/presets", { recursive: true });
  const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { levelHp: {}, levels: {} };
  const presets = new Map<Profile, Save>();
  const loadPreset = (level: number, p: Profile) => {
    const f = `balance/presets/L${level + 1}-${p}.json`;
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Save) : undefined;
  };
  for (const p of CORRIDOR_PROFILES) presets.set(p, (FROM === 0 ? emptySave() : loadPreset(FROM, p))!);
  for (const [k, v] of Object.entries(state.levelHp)) BALANCE.levelHp[Number(k)] = v;

  for (let level = FROM; level < TO; level++) {
    for (const p of CORRIDOR_PROFILES) writeFileSync(`balance/presets/L${level + 1}-${p}.json`, JSON.stringify(presets.get(p)));
    const t0 = performance.now();
    let lo = Math.log(0.02);
    let hi = Math.log(50);
    let best: { factor: number; results: JobResult[]; score: number } | undefined;
    for (let round = 0; round < ROUNDS; round++) {
      const factors = Array.from({ length: VARIANTS }, (_, k) => Math.exp(lo + ((hi - lo) * k) / (VARIANTS - 1)));
      const jobs: Job[] = factors.flatMap((factor) =>
        CORRIDOR_PROFILES.map((profile) => ({ level, profile, save: presets.get(profile)!, overrides: { levelHp: { ...BALANCE.levelHp, [level]: factor } } })),
      );
      const results = await pool(jobs);
      const scored = factors.map((factor, k) => {
        const rs = results.slice(k * CORRIDOR_PROFILES.length, (k + 1) * CORRIDOR_PROFILES.length);
        return { factor, results: rs, score: score(rs) };
      });
      // Best: inside the corridor first (generalist nearest 10), else the least miss.
      const gen = (s: (typeof scored)[number]) => Math.abs(s.results.find((r) => r.profile === "generalist")!.failures - CORRIDOR.generalist.target);
      scored.sort((a, b) => a.score - b.score || gen(a) - gen(b));
      if (!best || scored[0]!.score < best.score || (scored[0]!.score === best.score && gen(scored[0]!) < gen(best))) best = scored[0]!;
      process.stdout.write(`L${level + 1} round ${round + 1}: best ×${scored[0]!.factor.toFixed(3)} miss ${scored[0]!.score.toFixed(1)} [${scored[0]!.results.map((r) => `${r.profile[0]}${r.failures}${r.won ? "" : "!"}`).join(" ")}]\n`);
      if (best.score === 0 && gen(best) <= 1) break;
      // Narrow to the edge: the generalist's failures rise with the factor; look between the last factor below the
      // target and the first at or above it (stuck counts as above). If all lie on one side, move the window there.
      const byFactor = scored.slice().sort((x, y) => x.factor - y.factor);
      const genOf = (s: (typeof scored)[number]) => {
        const r = s.results.find((q) => q.profile === "generalist")!;
        return r.won ? r.failures : Infinity;
      };
      const above = byFactor.findIndex((s) => genOf(s) >= CORRIDOR.generalist.target);
      const a = above < 0 ? VARIANTS - 1 : above === 0 ? 0 : above - 1;
      const b = above < 0 ? VARIANTS - 1 : above;
      const spread = hi - lo;
      if (above < 0) {
        lo = Math.log(byFactor[VARIANTS - 1]!.factor);
        hi = lo + spread;
      } else if (above === 0) {
        hi = Math.log(byFactor[0]!.factor);
        lo = hi - spread;
      } else {
        lo = Math.log(byFactor[a]!.factor);
        hi = Math.log(byFactor[b]!.factor);
      }
      if (hi - lo < 1e-3) break;
    }
    BALANCE.levelHp[level] = best!.factor;
    state.levelHp[level] = Number(best!.factor.toPrecision(4));
    const failures: Partial<Record<Profile, number>> = {};
    for (const r of best!.results) failures[r.profile] = r.failures;
    // Presets for the next level: the saves the profiles bring out of this one; a profile that did not win keeps its
    // old save (and is marked as a miss), so the next level still has something to start from.
    for (const r of best!.results) if (r.after) presets.set(r.profile, r.after);
    const diag = await runInProcess({ level, profile: "generalist", save: loadPreset(level, "generalist")!, overrides: { levelHp: { ...BALANCE.levelHp } }, cap: 1, diag: true });
    state.levels[level] = { factor: state.levelHp[level]!, failures, inCorridor: best!.score === 0, diag: diag.diag };
    writeFileSync(STATE, JSON.stringify(state, null, 1));
    process.stdout.write(`L${level + 1} done ×${state.levelHp[level]} in ${Math.round((performance.now() - t0) / 1000)} s ${best!.score === 0 ? "IN" : "OUT"} ${JSON.stringify(failures)}\n`);
  }
}, 86_400_000);
