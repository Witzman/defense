# Balancing report (#11, levels 1–3, after #39–#42)

From `balance/search.json` (`npm run balance:search`), first run on the game with danger avoidance (#39), research-only
swivel arc (#41), cohesion (#40) and hit effects (#42). Failed runs before the first win.
Corridor: generalist 6–14, random ≤ 40; optimizer and specialist only observed.

| Level | hp × | points × | generalist | optimizer | random | in corridor |
|---|---|---|---|---|---|---|
| 1 | 1.000 | 2.154 | 0 | 0 | 32 | no |
| 2 | 1.000 | 1.682 | 0 | 0 | 3 | no |
| 3 | 2.391 | 5.185 | 4 | 0 | 5 | no (closest) |

Applied in `BALANCE`: level 3 only (hp ×2.391, points ×5.185). Level 1 keeps hp ×0.8 and points ×1 (the guards of #9 need
it; the search's pair leaves the random player at 32 of 40). Level 2 keeps the defaults: the search found nothing better.

## Measures (generalist, one run with the preset it enters the level with)

| Level | run (s) | target (s) | jams (≥5 % cells full) | deep water in reach | water share | points/min | best earlier |
|---|---|---|---|---|---|---|---|
| 1 | 20 | 60–120 | 0 % | 100 % | 38 % | – | – |
| 2 | 54 | 60–120 | 0 % | 100 % | 74 % | 442 | 271 |
| 3 | 28 | 60–120 | 0 % | 100 % | 49 % | 122 | 732 |

## Findings

- **Runs are far too short** (20–54 s against 60–120 s): the enemies are gone before the stream has run.
- **No jams** in levels 1–3 (the target only asks from level 6), deep water is fully in reach.
- **Level 3 pays less than level 2** (122 against 732 points/min with the same research): the newest level is not the
  best farm (criterion 5 fails).
- The generalist gets 0 failures where the random player needs 32 on level 1: the window "generalist 6–14, random ≤ 40"
  has no hit-point value on that level; the bots differ by more than the corridor.
