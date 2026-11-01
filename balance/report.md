# Balancing report (#11, interim)

Written by hand from `balance/search.json` (`npm run balance:search`); the older table from #9 is obsolete (it ran on the
multiplicative tree). Numbers: failed runs before the first win. Corridor: generalist 6–14, optimizer ≥ 2, random ≤ 40.

| Level | hp × | points × | generalist | optimizer | random | in corridor |
|---|---|---|---|---|---|---|
| 1 | 0.696 | 0.549 | 11 | 2 | 0 | yes, but not applied (see below) |
| 2 | 0.829 | 1.238 | 3 | 0 | 6 | no |
| 3 | 0.224 | 2.154 | 0 | 0 | 1 | no |
| 4 | 4.472 | 0.167 | 2 | 0 | 11 | no |

Levels 2–4 are search results, not applied: no combination of the two knobs reached the corridor.

## Findings

- The three bots differ in strength by far more than the corridor allows. From level 2 the optimizer wins on the first
  try in every variant where the generalist still wins; raising the level's hit points past the generalist's edge sends
  the generalist and the random player straight to stuck (level 4, generalist: ×5.2 → 0 failures, ×7.8 → 5, ×11.7 → stuck).
  The window "generalist 6–14 and optimizer ≥ 2" does not exist with hit points and points per kill alone.
- Failures do not rise smoothly with hit points; the step is about one factor 1.5 wide.
- Tool bug found on the way: an early-abort cap on a profile left it without a save to hand on, so its next preset was a
  new game. Fixed: capped profiles play on to the win for the preset.
- Cost of the search is CPU time per run (map size and route rebuilds), not game time: level 10 run ≈ 3 s, `sampleFlow` ≈ 11 s.
  The probe is cached per process now, but every job is its own process, so it helps little.

- Level 1's points factor 0.549 makes the first kills worth under 1 point, which rounds to 0 and breaks the rule "every kill
  counts" (`test/game/points.test.ts`). So it is not applied; the knob needs a floor or the points need finer rounding first.

## Decision needed (owner)

Relax the optimizer criterion (≥ 2 → "observe only", like the specialist) or give the generalist more reach. Until then
levels 1–25 are not tuned; nothing in `BALANCE` has changed.
