/**
 * Design language "Fluid" (#16): a sea chart crossed with an OpenStreetMap atlas, on which the enemy mass glows as a
 * liquid and the controls float as dark glass. docs/design.md explains the rules; these are the values. The CSS
 * custom properties in style.css carry the same colours for the interface.
 */

export type Rgb = readonly [number, number, number];

export const MAP = {
  /** Land as paper; also everything outside the map. */
  land: [238, 230, 207] as Rgb,
  sand: [236, 222, 178] as Rgb,
  meadow: [214, 226, 178] as Rgb,
  forest: [182, 205, 160] as Rgb,
  forestInk: "rgba(96, 128, 82, 0.85)",
  /** Shallow water at the shore, deep water far from it. */
  water: [156, 196, 211] as Rgb,
  waterDeep: [121, 168, 190] as Rgb,
  depthLine: [64, 104, 122] as Rgb,
  coast: [64, 104, 122] as Rgb,
  /** Paper grain: ± this much per channel. */
  grain: 6,
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
  spawn: "#9a6a00",
  spawnCore: "#ffd36b",
  invalid: "rgba(226, 72, 61, 0.55)",
  spark: "#fff6d0",
};

export function css(c: Rgb, alpha = 1): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}
