# Balancing report (#11, interim, stopped after level 7)

Written by hand from `balance/search.json` (`npm run balance:search`). Numbers: failed runs before the first win.
Corridor (owner, 2026-11-01): generalist 6–14, random ≤ 40; the optimizer and the specialist are only watched.
Points per kill never below 1 (rounding, "every kill counts").

| Level | hp × | points × | generalist | optimizer | random | in corridor |
|---|---|---|---|---|---|---|
| 1 | 0.954 | 1.735 | 4 | 1 | 8 | no |
| 2 | 0.224 | 4.101 | 0 | 0 | 1 | no |
| 3 | 0.224 | 3.623 | 0 | 0 | 0 | no |
| 4 | 1.000 | 1.025 | 0 | 0 | 0 | no |
| 5 | 2.115 | 4.309 | 1 | 0 | 4 | no |
| 6 | 16.01 | 0.892 | 8 | 0 | 0 | yes |
| 7 | 1.000 | 0.487 | 0 | 0 | 0 | no |

None of these factors is applied in `BALANCE`; nothing in the game has changed.

## Findings

- The generalist's failures are not smooth in the level's hit points: at level 4 (earlier run) ×5.2 gave 0 failures, ×7.8
  gave 5, ×11.7 stuck. Two knobs (hit points, points per kill) find the window only on some levels (6 of 7 miss).
- The optimizer wins at once nearly everywhere; it cannot be held to a minimum of failures (criterion dropped).
- Tool bug fixed: a profile cut short by its early-abort cap had no save to hand on.
- Search cost is CPU time per run (map size, route rebuilds): about 80 s for level 1, 1,300 s for level 6, 440 s for level 7.

## Stopped on purpose

Owner 2026-11-01 stopped the run: #41 (turning angle by research), #40 (collisions) and #42 (tree interactions) change
the game under the measurement. Tune again after them; presets in `balance/presets/` are from this run and stale then.
