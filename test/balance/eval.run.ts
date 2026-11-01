// One balancing job in its own process (#11): reads the job from the file in BALANCE_JOB, writes the result to BALANCE_OUT.
// Started by search.run.ts, never by `npm test`.
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runJob, type Job } from "../../src/balance/measure.ts";

it("balancing job", () => {
  const job = JSON.parse(readFileSync(process.env.BALANCE_JOB!, "utf8")) as Job;
  writeFileSync(process.env.BALANCE_OUT!, JSON.stringify(runJob(job)));
}, 3_600_000);
