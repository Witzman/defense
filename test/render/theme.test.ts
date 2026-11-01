import { describe, expect, it } from "vitest";
import { MAP, type Rgb } from "../../src/render/theme.ts";
import { ENEMY_TYPES } from "../../src/content/enemies.ts";
import { TURRET_TYPES } from "../../src/content/turrets.ts";

/** WCAG relative luminance and contrast ratio. */
function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
const contrast = (a: Rgb, b: Rgb) => {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

describe("contrast of the map (#26)", () => {
  it.each(ENEMY_TYPES.map((t) => [t.name, t.color] as const))("%s stands out from shallow and deep water (≥ 4.5)", (_name, color) => {
    expect(contrast(hex(color), MAP.water)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(color), MAP.waterDeep)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TURRET_TYPES.map((t) => [t.name, t.color] as const))("the ring of %s stands out from every kind of land (≥ 3)", (_name, color) => {
    for (const land of [MAP.land, MAP.sand, MAP.meadow, MAP.forest]) expect(contrast(hex(color), land)).toBeGreaterThanOrEqual(3);
  });
});
