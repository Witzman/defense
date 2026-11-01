// Scan one level: a profile's failures against the hit-point factor, for finding edges (#11).
// Uses the presets of balance/presets/. Started by hand: SCAN_LEVEL=3 SCAN_LO=0.5 SCAN_HI=8 npx vitest run --config vitest.balance.config.ts test/balance/scan.run.ts
import { it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job, JobResult } from "../../src/balance/measure.ts";

const level = Number(process.env.SCAN_LEVEL ?? 3);
const profile = (process.env.SCAN_PROFILE ?? "generalist") as Job["profile"];
const kv = Number(process.env.SCAN_KV ?? 1);
const lo = Number(process.env.SCAN_LO ?? 0.5);
const hi = Number(process.env.SCAN_HI ?? 4);
const n = Number(process.env.SCAN_N ?? 10);
const tmp = mkdtempSync(join(tmpdir(), "scan-"));

function one(k: number, hp: number): Promise<JobResult> {
  const save = JSON.parse(readFileSync(`balance/presets/L${level + 1}-${profile}.json`, "utf8"));
  const job: Job = { level, profile, save, cap: 30, overrides: { levelHp: { [level]: hp }, levelKillValue: { [level]: kv } } };
  writeFileSync(join(tmp, `${k}.job.json`), JSON.stringify(job));
  return new Promise((res, rej) => {
    const c = spawn("node_modules/.bin/vitest", ["run", "--config", "vitest.balance.config.ts", "test/balance/eval.run.ts"], {
      env: { ...process.env, BALANCE_JOB: join(tmp, `${k}.job.json`), BALANCE_OUT: join(tmp, `${k}.out.json`) },
      stdio: "ignore",
    });
    c.on("exit", (code) => (code === 0 ? res(JSON.parse(readFileSync(join(tmp, `${k}.out.json`), "utf8"))) : rej(new Error("job failed"))));
  });
}

it("scan", async () => {
  const hps = Array.from({ length: n }, (_, k) => Math.exp(Math.log(lo) + ((Math.log(hi) - Math.log(lo)) * k) / (n - 1)));
  const rs = await Promise.all(hps.map((hp, k) => one(k, hp)));
  hps.forEach((hp, k) => process.stdout.write(`SCAN L${level + 1} ${profile} hp×${hp.toFixed(3)} kv×${kv}: failures ${rs[k]!.failures}${rs[k]!.won ? "" : " (stuck)"} run ${rs[k]!.seconds.toFixed(0)}s\n`));
}, 3_600_000);
