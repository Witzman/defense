/**
 * Design language "Fluid" (#16, #26): an atlas drawn at night — dark land and water with the drawing of a sea chart
 * and an OpenStreetMap atlas — on which the enemy mass glows as a liquid and the controls float as dark glass.
 * docs/design.md explains the rules; these are the values. The CSS custom properties in style.css carry the same
 * colours for the interface. The map is dark so that everything that moves has contrast (test/render/theme.test.ts).
 */

export type Rgb = readonly [number, number, number];

export const MAP = {
  /** Land; also everything outside the map. */
  land: [30, 41, 40] as Rgb,
  sand: [41, 53, 48] as Rgb,
  meadow: [33, 47, 41] as Rgb,
  forest: [26, 37, 33] as Rgb,
  forestInk: "rgba(110, 150, 120, 0.4)",
  /** Shallow water at the shore, deep water far from it. */
  water: [22, 50, 74] as Rgb,
  waterDeep: [12, 27, 46] as Rgb,
  /** Depth lines: only a hint (owner, #26). */
  depthLine: [120, 220, 205] as Rgb,
  depthAlpha: 0.1,
  /** The coast: a thin glowing line with a faint halo into the water. */
  coast: [120, 220, 205] as Rgb,
  coastGlow: 0.22,
  /** Footpaths on land, dashed (OpenStreetMap). */
  path: "rgba(210, 180, 130, 0.32)",
  /** Map lettering (#18): waters in italics, islands and places in small capitals. */
  labelWater: "rgba(140, 220, 210, 0.75)",
  labelLand: "rgba(220, 232, 228, 0.72)",
  labelHalo: "rgba(8, 18, 28, 0.85)",
  /** Grain: ± this much per channel. */
  grain: 4,
};

export const GLASS = {
  /** Dark glass of turrets, panels and contrast rims. */
  body: "rgba(12, 26, 40, 0.92)",
  rim: "rgba(10, 22, 36, 0.55)",
  accent: "#7ee0d2",
};

export const SIGNAL = {
  goal: "#ff6b5e",
  goalCore: "#ffe3de",
  goalEdge: "#7a2e2a",
  spawn: "#ffd36b",
  spawnCore: "#fff1c2",
  invalid: "rgba(226, 72, 61, 0.55)",
  spark: "#fff6d0",
};

export function css(c: Rgb, alpha = 1): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}
