import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { turretType, type TurretKind } from "../../src/content/turrets.ts";
import { placeGreedy, sampleFlow } from "../../src/balance/placement.ts";
import { analyse } from "../../src/game/stats.ts";
import { SAMPLE_TICKS } from "../../src/sim/stats.ts";
import { createWorld, step, useAbility, type Arsenal, type World } from "../../src/sim/world.ts";

// The run analysis (#32) only counts: every kill and every breakthrough lands in exactly one bucket.
const KINDS: TurretKind[] = ["cannon", "napalm", "laser", "tesla", "flamer", "mortar"];
const arsenal: Arsenal = {
  turrets: Object.fromEntries(KINDS.map((k) => [k, { capacity: 2, stats: turretType(k).base }])),
  ability: { damage: 50, radius: 2, cooldown: 3 },
};

function play(levelIndex: number, kinds = KINDS): World {
  // Fixed hit points: this test counts, it must not move with the balancing (#11).
  const base = LEVELS[levelIndex]!();
  const level = { ...base, enemies: { ...base.enemies, hpScale: 6 * 1.05 ** levelIndex } };
  const w = createWorld(level, arsenal, placeGreedy(level, arsenal, sampleFlow(level), kinds));
  // The precision shot every few seconds at the first blob, so its bucket is used too.
  while (w.status === "running" && w.tick < 30 * 60 * 10) {
    step(w);
    if (w.tick % 90 === 0 && w.enemies[0]) useAbility(w, w.enemies[0].x, w.enemies[0].y);
  }
  return w;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe("run analysis counts (#32)", () => {
  const runs = [3, 9].map((i) => ({ i, w: play(i) }));

  it.each(runs)("level $i: breakthroughs over types and goals add up to the arrived", ({ w }) => {
    const a = analyse(w);
    expect(sum(a.types.map((t) => t.arrived))).toBe(w.arrived);
    expect(sum(Object.values(w.stats.arrived).flat())).toBe(w.arrived);
    expect(w.arrived).toBeGreaterThan(0);
  });

  it.each(runs)("level $i: kills of turrets, burning, precision shot and others add up to the killed", ({ w }) => {
    const a = analyse(w);
    const turretKills = sum(a.turrets.map((t) => t.kills));
    expect(turretKills).toBeLessThanOrEqual(w.killed);
    expect(turretKills + sum(a.buckets.map((b) => b.kills))).toBe(w.killed);
    expect(sum(a.types.map((t) => t.killed))).toBe(w.killed);
    expect(w.stats.burn.kills).toBeGreaterThan(0);
    expect(w.stats.ability.kills).toBeGreaterThan(0);
    expect(w.stats.other.kills).toBe(0);
    expect(a.turrets.every((t) => t.damage >= 0)).toBe(true);
    expect(sum(a.turrets.map((t) => t.damage))).toBeGreaterThan(0);
  });

  it.each(runs)("level $i: what spawned is what was killed, arrived or still out", ({ w }) => {
    const a = analyse(w);
    expect(sum(a.types.map((t) => t.spawned))).toBe(w.killed + w.arrived + w.active);
    for (const t of a.types) expect(t.killed + t.arrived).toBeLessThanOrEqual(t.spawned);
  });

  it.each(runs)("level $i: one energy sample per second, from full to what is left", ({ w }) => {
    for (const [g, samples] of w.stats.energy.entries()) {
      expect(samples[0]).toBe(w.level.goalEnergy);
      expect(samples.at(-1)).toBe(w.energies[g]);
      expect(samples.length).toBe(Math.floor(w.tick / SAMPLE_TICKS) + 1 + (w.tick % SAMPLE_TICKS === 0 ? 0 : 1));
    }
  });

  it("names the fallen goal, the top breakthroughs and the best and worst turret", () => {
    const { w } = runs[0]!;
    const a = analyse(w);
    if (w.status === "lost") expect(a.goals[a.worstGoal]!.fell).toBe(true);
    expect(a.topArrived.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < a.topArrived.length; i++) expect(a.topArrived[i - 1]!.arrived).toBeGreaterThanOrEqual(a.topArrived[i]!.arrived);
    expect(a.best!.kills).toBe(Math.max(...a.turrets.map((t) => t.kills)));
    expect(a.worst!.kills).toBe(Math.min(...a.turrets.map((t) => t.kills)));
  });

  it("counts the same for the same run", () => {
    expect(analyse(play(3))).toEqual(analyse(runs[0]!.w));
  }, 60_000);
});
