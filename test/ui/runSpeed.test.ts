import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels.ts";
import { turretType } from "../../src/content/turrets.ts";
import { placeGreedy, sampleFlow } from "../../src/balance/placement.ts";
import { createWorld, DT, step, type Arsenal, type World } from "../../src/sim/world.ts";
import { frameSteps, MAX_FRAME_SECONDS, nextSpeed, parseSpeed } from "../../src/ui/controls.ts";

describe("steps per frame (#33)", () => {
  it("runs twice the steps at 2× over the same real time", () => {
    let a1 = 0, a2 = 0, n1 = 0, n2 = 0;
    for (let f = 0; f < 600; f++) {
      const r1 = frameSteps(a1, 1 / 60, 1.3225, false, DT);
      const r2 = frameSteps(a2, 1 / 60, 1.3225 * 2, false, DT);
      a1 = r1.acc; a2 = r2.acc; n1 += r1.steps; n2 += r2.steps;
    }
    expect(n1).toBe(Math.floor((600 / 60) * 1.3225 / DT + 1e-9));
    expect(Math.abs(n2 - 2 * n1)).toBeLessThanOrEqual(1);
  });

  it("runs nothing and keeps the remainder while paused", () => {
    expect(frameSteps(0.02, 1, 2, true, DT)).toEqual({ steps: 0, acc: 0.02 });
  });

  it("caps a long frame, so a slow device does not spiral", () => {
    const r = frameSteps(0, 5, 2, false, DT);
    expect(r.steps).toBe(Math.floor((MAX_FRAME_SECONDS * 2) / DT + 1e-9));
    expect(frameSteps(0, -1, 1, false, DT).steps).toBe(0);
  });

  it("counts exact multiples of a step as whole steps", () => {
    expect(frameSteps(0, 3 * DT, 1, false, DT).steps).toBe(3);
  });

  it("toggles 1× ↔ 2× and reads the stored speed", () => {
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(1);
    expect(parseSpeed("2")).toBe(2);
    expect(parseSpeed(null)).toBe(1);
    expect(parseSpeed("7")).toBe(1);
  });

  it("plays the same run at 2× as at 1× (#28: runs are deterministic)", () => {
    const level = LEVELS[0]!();
    const arsenal: Arsenal = { turrets: { cannon: { capacity: 4, stats: turretType("cannon").base } } };
    const placements = placeGreedy(level, arsenal, sampleFlow(level), ["cannon"]);
    const play = (speed: number) => {
      const w: World = createWorld(level, arsenal, placements);
      let acc = 0;
      let frames = 0;
      // Uneven frames, like a real browser.
      while (w.status === "running" && frames < 1_000_000) {
        const r = frameSteps(acc, frames % 7 === 0 ? 0.05 : 1 / 60, 1.3225 * speed, frames % 50 < 5, DT);
        acc = r.acc;
        for (let i = 0; i < r.steps && w.status === "running"; i++) step(w);
        frames++;
      }
      return { out: { status: w.status, tick: w.tick, killed: w.killed, arrived: w.arrived, energies: [...w.energies] }, frames };
    };
    const one = play(1);
    const two = play(2);
    expect(two.out).toEqual(one.out);
    expect(two.frames).toBeLessThan(one.frames * 0.6);
  }, 60_000);
});
