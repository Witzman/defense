# Design language "Fluid"

Flow Defense looks like a **sea chart crossed with an OpenStreetMap atlas**, on which the enemy mass **glows as a
liquid** and the controls **float above as dark glass**. Two layers, two materials: the world is paper and ink, the
interface is glass and light. Everything new follows these rules; the values live in code, not here.

| Where | What |
|---|---|
| `src/render/theme.ts` | colours of the map, the glass and the signals (canvas) |
| `src/style.css` `:root` | the same colours as custom properties (interface) |
| `src/render/terrain.ts` | the map sheet, drawn once per level |
| `src/render/fluid.ts` | the enemy mass |
| `src/render/canvas.ts` | turrets, fire, spawns, goals, the frame |

## Colour

- **Map: paper and water.** Land is warm paper (`#eee6cf`) with beach, meadow and woodland in the muted colours
  OpenStreetMap uses; water runs from shallow `#9cc4d3` at the shore to deep `#79a8be`, with the depth lines of a sea
  chart and a blue-grey coastline. The map is pale and quiet, so that everything that moves stands out.
- **Enemies own the saturated colours.** Each type keeps its colour (`src/content/enemies.ts`) — the colour is how a
  player tells types apart (#2). Nothing on the map may use a saturated colour that could be mistaken for an enemy.
- **Turrets own their ring colour** (`src/content/turrets.ts`); their shots carry the same colour.
- **Glass:** ink `#0a1624` at 82 % with a cyan edge `rgba(120, 220, 205, 0.25)`; text `#dcebea`, muted `#8fa9ab`.
- **Signals:** accent cyan `#7ee0d2` (primary action, titles, selection), coral `#ff6b5e` (goals, goal energy),
  gold `#ffd36b` (research points, ready ability, spawns).

## Type

- **Sora** for the whole interface, self-hosted (`src/fonts/`, Latin subset, variable weight; no request to a font
  service). Regular for text, 600 for numbers that matter and buttons; tabular figures in counters.
- **Titles** (game name, panel headings): 12–13 px, 600, uppercase, 4 px letter spacing, accent cyan.
- Map lettering (place names, a serif) is part of #18.

## Shape

- **Glass floats.** HUD and hints are pills (`999px`); the bar, the tool column, panels and the banner have 22 px
  corners; buttons and slots 14 px. Every glass surface has the cyan edge and, where it floats over the map, a
  backdrop blur. Large panels are opaque, so text never sits on the map.
- **The world is round.** Coasts are smooth curves with a slight hand-drawn wobble, never cell steps. Turrets are
  discs, spawns are rings, goals are discs with a core.
- **The symbol of a turret is the same everywhere**: map, bar, research (#2).

## Material and light

- **The mass is a liquid.** Blobs melt into one body with a sharp surface and a pale halo; fuller parts shine
  brighter; up close each member catches a highlight, so single blobs stay countable. The liquid stays in the water:
  it is cut off where the shore begins (#11).
- **Fire is light with a dark rim.** Every shot, beam, flash and blast has a dark rim under its bright core, so it
  reads on the pale map and on the bright mass alike. Fire fades over a few ticks instead of blinking for one:
  bolts fly on and fade, blasts leave a shock ring, impacts throw sparks. A player must be able to see which turret
  is working.
- **Turrets are dark glass** with a ring and barrel in their colour and a soft glow of the same colour.

## Motion

- Spawns well outward in rings; goals pulse with a ring running out; the goal fades as its energy drains.
- Afterglow of fire: `TRAIL_TICKS` simulation ticks.
- Interface changes are quick and plain; nothing in the interface moves for decoration.

## Cost

The look must not cost the game its frame rate (#15: iPad and desktop).

- The map is drawn **once per level** into an image of at most 2.5 million pixels.
- The liquid is computed per frame on the CPU over the **visible part only**, at most 200,000 pixels, then scaled
  up. No canvas `filter` (Safari lacks it), no `shadowBlur` per shot.
- Gradients only for fresh fire; older fire is drawn as plain strokes.
