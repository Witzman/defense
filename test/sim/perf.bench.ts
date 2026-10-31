// Not part of `npm test`. Run: npx vitest bench --run test/sim/perf.bench.ts
import { bench, describe } from "vitest";
import { level3 } from "../../src/content/levels.ts";
import { createWorld, step, type World } from "../../src/sim/world.ts";

/** Level 3 after `seconds` of free flow: the real map, the real stream, no turrets. */
function flowing(seconds: number): World {
  const w = createWorld(level3(), { capacity: 0, turret: { range: 4, damage: 1, shotsPerSecond: 3 } }, [], 1);
  for (let i = 0; i < seconds * 30; i++) step(w);
  return w;
}

for (const s of [20, 60]) {
  const w = flowing(s);
  describe(`level 3 after ${s}s: ${w.enemies.length} blobs, ${w.active} enemies`, () => {
    bench("step", () => step(w), { time: 1500 });
  });
}
