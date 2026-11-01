# Balancing report (#11, working notes)

Rule of work (owner, 2026-11-01): level by level, short scans first, adjust, test; long runs only after.
Gate: generalist 6–14 failed runs before the first win. Random player, optimizer, specialist are only observed (see the
comment in #11: from level 3 the random player never gets through, 2 % kills after 100 tries). Guard test of level 1 holds.
Search: `npm run balance:search` (generalist only; `BALANCE_PROFILES=generalist,optimizer,random` for all);
scans: `test/balance/scan.run.ts`.

## Applied in `BALANCE` (levels 1–9)

| Level | hp × | points × | generalist failures | run (s) | points/min vs best earlier |
|---|---|---|---|---|---|
| 1 | 0.8 | 1 | 0 (guard: random must win) | – | – |
| 2 | 1.673 | 1.068 | 8 (in corridor) | – | – |
| 3 | 2.58 | 2.195 | 5 | 87 | 3,297 / 519 |
| 4 | 9.457 | 2.843 | 4 | 85 | 16,470 / 4,026 |
| 5 | 7.484 | 2.422 | 3 | 106 | 42,509 / 19,313 |
| 6 | 1.454 | 1.775 | 0 | 74 | 126,980 / 45,628 |
| 7 | 16.59 | 2.275 | 4 | 85 | 397,419 / 128,495 |
| 8 | 1.454 | 1.667 | 0 | 74 | 958,586 / 432,703 |
| 9 | 1.454 | 1.221 | 0 | 75 | 1,957,398 / 958,586 |

## Findings

- Run durations (measured with the save the profile has after winning) are 74–106 s: inside the 60–120 s of #2.
- The newest level pays the most per minute on every level (criterion 5 holds).
- No jams (≥ 5 % of the water cells full) and deep water is fully in reach on levels 3–9; jams are wanted from level 6 on:
  open (needs the channel width / capacity knobs, not the hit points).
- Levels 6, 8, 9 have 0 failures: the search found no hit-point factor in 0.05–20 between "wins at once" and "stuck".
  Levels 3–5 and 7 are 1–3 failures short of the corridor.
- The points factor is floored so that each level pays more per kill than the one before (`test/game/points.test.ts`).
