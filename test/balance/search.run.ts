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
  levelKillValue: Record<number, number>;
  /** Per level: factor, failures per profile, diagnostics of the generalist. */
  levels: Record<number, { factor: number; killValue: number; failures: Partial<Record<Profile, number>>; inCorridor: boolean; diag?: unknown }>;
}

/** Van der Corput sequence in `base`: points that spread evenly over 0..1. */
function halton(n: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let i = n; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

const score = (rs: JobResult[]) => rs.reduce((s, r) => s + miss(r.profile, r.failures, r.won), 0);

it("balancing search", async () => {
  mkdirSync("balance/presets", { recursive: true });
  const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { levelHp: {}, levelKillValue: {}, levels: {} };
  const presets = new Map<Profile, Save>();
  const loadPreset = (level: number, p: Profile) => {
    const f = `balance/presets/L${level + 1}-${p}.json`;
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Save) : undefined;
  };
  for (const p of CORRIDOR_PROFILES) presets.set(p, (FROM === 0 ? emptySave() : loadPreset(FROM, p))!);
  for (const [k, v] of Object.entries(state.levelHp)) BALANCE.levelHp[Number(k)] = v;
  for (const [k, v] of Object.entries(state.levelKillValue)) BALANCE.levelKillValue[Number(k)] = v;

  for (let level = FROM; level < TO; level++) {
    for (const p of CORRIDOR_PROFILES) writeFileSync(`balance/presets/L${level + 1}-${p}.json`, JSON.stringify(presets.get(p)));
    const t0 = performance.now();
    // Settled in an earlier run: replay it once with the stored numbers, which hands on the presets.
    if (state.levels[level]) {
      const rs = await pool(CORRIDOR_PROFILES.map((profile) => ({ level, profile, save: presets.get(profile)!, cap: 60, overrides: { levelHp: { ...BALANCE.levelHp }, levelKillValue: { ...BALANCE.levelKillValue } } })));
      for (const r of rs) if (r.after) presets.set(r.profile, r.after);
      for (const p of CORRIDOR_PROFILES) writeFileSync(`balance/presets/L${level + 2}-${p}.json`, JSON.stringify(presets.get(p)));
      process.stdout.write(`L${level + 1} kept ${JSON.stringify(state.levels[level]!.failures)}\n`);
      continue;
    }
    // Two knobs per level, searched in log space: hit points of the level and points per kill. Each round samples
    // VARIANTS points of a box (Halton sequence, so they spread evenly) and the next box closes in on the best one.
    let box = { hp: [Math.log(0.05), Math.log(20)], kv: [Math.log(0.1), Math.log(10)] } as Record<"hp" | "kv", [number, number]>;
    type Best = { hp: number; kv: number; results: JobResult[]; score: number };
    let best: Best | undefined;
    const genFail = (r: JobResult[]) => r.find((q) => q.profile === "generalist")!.failures;
    const dist = (x: Best) => Math.abs(genFail(x.results) - CORRIDOR.generalist.target);
    for (let round = 0; round < ROUNDS; round++) {
      const points = Array.from({ length: VARIANTS }, (_, k) => ({
        hp: Math.exp(box.hp[0] + (box.hp[1] - box.hp[0]) * halton(k + 1 + round * VARIANTS, 2)),
        kv: Math.exp(box.kv[0] + (box.kv[1] - box.kv[0]) * halton(k + 1 + round * VARIANTS, 3)),
      }));
      // The current best stays in the field, so a round never loses ground.
      if (best) points[0] = { hp: best.hp, kv: best.kv };
      const jobs: Job[] = points.flatMap((pt) =>
        CORRIDOR_PROFILES.map((profile) => ({
          level, profile, save: presets.get(profile)!,
          overrides: { levelHp: { ...BALANCE.levelHp, [level]: pt.hp }, levelKillValue: { ...BALANCE.levelKillValue, [level]: pt.kv } },
        })),
      );
      const results = await pool(jobs);
      const scored: Best[] = points.map((pt, k) => {
        const rs = results.slice(k * CORRIDOR_PROFILES.length, (k + 1) * CORRIDOR_PROFILES.length);
        return { ...pt, results: rs, score: score(rs) };
      });
      scored.sort((x, y) => x.score - y.score || dist(x) - dist(y));
      if (!best || scored[0]!.score < best.score || (scored[0]!.score === best.score && dist(scored[0]!) < dist(best))) best = scored[0]!;
      process.stdout.write(`L${level + 1} round ${round + 1}: hp ×${best.hp.toFixed(3)} kv ×${best.kv.toFixed(3)} miss ${best.score.toFixed(1)} [${best.results.map((r) => `${r.profile[0]}${r.failures}${r.won ? "" : "!"}`).join(" ")}]\n`);
      if (best.score === 0 && dist(best) <= 1) break;
      // Close in: half the width of the box around the best, but never past the first box.
      for (const key of ["hp", "kv"] as const) {
        const half = (box[key][1] - box[key][0]) / 4;
        const c = Math.log(best[key]);
        box[key] = [c - half, c + half];
      }
    }
    BALANCE.levelHp[level] = best!.hp;
    BALANCE.levelKillValue[level] = best!.kv;
    state.levelHp[level] = Number(best!.hp.toPrecision(4));
    state.levelKillValue[level] = Number(best!.kv.toPrecision(4));
    const failures: Partial<Record<Profile, number>> = {};
    for (const r of best!.results) failures[r.profile] = r.failures;
    // Presets for the next level: the saves the profiles bring out of this one; a profile that did not win keeps its
    // old save (and is marked as a miss), so the next level still has something to start from.
    // A profile cut short by its early-abort cap has not won, so it has no save to hand on: play it on to the win.
    const overrides = { levelHp: { ...BALANCE.levelHp }, levelKillValue: { ...BALANCE.levelKillValue } };
    const done = await pool(
      best!.results.filter((r) => !r.after).map((r) => ({ level, profile: r.profile, save: presets.get(r.profile)!, overrides, cap: 60 })),
    );
    for (const r of [...best!.results, ...done]) if (r.after) presets.set(r.profile, r.after);
    const diag = await runInProcess({ level, profile: "generalist", save: loadPreset(level, "generalist")!, overrides: { levelHp: { ...BALANCE.levelHp }, levelKillValue: { ...BALANCE.levelKillValue } }, cap: 1, diag: true });
    state.levels[level] = { factor: state.levelHp[level]!, killValue: state.levelKillValue[level]!, failures, inCorridor: best!.score === 0, diag: diag.diag };
    writeFileSync(STATE, JSON.stringify(state, null, 1));
    for (const p of CORRIDOR_PROFILES) writeFileSync(`balance/presets/L${level + 2}-${p}.json`, JSON.stringify(presets.get(p)));
    process.stdout.write(`L${level + 1} done hp ×${state.levelHp[level]} kv ×${state.levelKillValue[level]} in ${Math.round((performance.now() - t0) / 1000)} s ${best!.score === 0 ? "IN" : "OUT"} ${JSON.stringify(failures)}\n`);
  }
}, 86_400_000);
