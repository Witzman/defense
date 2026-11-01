# Balancing report (#11, working notes)

Rule of work (owner, 2026-11-01): level by level, get a feel with short scans, adjust, test; long runs only after.
Failed runs before the first win; corridor: generalist 6–14, random ≤ 40; optimizer/specialist only observed.
Scans: `test/balance/scan.run.ts` (one profile, a range of hit-point factors, cap `SCAN_CAP`).

## Applied in `BALANCE`

| Level | hp × | points × | notes |
|---|---|---|---|
| 1 | 0.8 | 1 | gentle start: generalist 0, random wins up to ×0.83 and is stuck from ×0.93 |
| 2 | 1.2 | 1 | random 5, generalist ~1; random is stuck from ×1.3 |
| 3 | 1 | 1 | to be tuned next (the earlier pair ×2.391/×5.185 broke "newest level pays most per kill") |

## Findings so far

- **Cliff:** every level has a hit-point factor above which a weak profile gets (nearly) no kills, hence no points, and
  is stuck for good; the generalist crosses its own cliff at about 1.3–1.5 times that factor. No factor puts the
  generalist at 6 failures while the random player still wins on levels 1 and 2 – the corridor is missed by 1–4 failures
  at best (level 2: ×3.05, points ×12: generalist 7, random stuck; ×2.8: generalist 3, random 8).
- **Points per kill are tied across levels:** a levels' factor must keep "the newest level pays most per kill" (rule of
  #5, test in `test/game/points.test.ts`); the search now floors the factor accordingly.
- **Run duration** in earlier reports was measured with the save from before the level (no turrets, lost): invalid; the
  search now measures with the save the profile has after winning.
