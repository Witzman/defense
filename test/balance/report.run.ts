// `npm run balance`: the full balancing run; writes balance/report.md. Not part of `npm test` (minutes, not seconds).
import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { balanceReport } from "../../src/balance/report.ts";
import type { Profile } from "../../src/balance/strategies.ts";

const levels = Number(process.env.BALANCE_LEVELS ?? 10);
const maxAttempts = Number(process.env.BALANCE_MAX_ATTEMPTS ?? 40);
const profiles = process.env.BALANCE_PROFILES ? (process.env.BALANCE_PROFILES.split(",") as Profile[]) : undefined;

it("balancing report", () => {
  const md = balanceReport({ levels: Array.from({ length: levels }, (_, i) => i), maxAttempts, profiles, log: (l) => process.stdout.write(l + "\n") });
  mkdirSync("balance", { recursive: true });
  writeFileSync("balance/report.md", md);
  process.stdout.write("\nwritten: balance/report.md\n");
}, 3_600_000);
