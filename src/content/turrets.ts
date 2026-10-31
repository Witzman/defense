import type { DamageType } from "./enemies.ts";

export type TurretKind = "cannon" | "mortar" | "flamer" | "laser" | "tesla";

/** How a weapon delivers its damage. */
export type Pattern =
  | { kind: "single" }
  | { kind: "splash"; radius: number }
  | { kind: "cone"; angle: number; burnSeconds: number }
  | { kind: "beam" }
  | { kind: "chain"; jumps: number; reach: number; falloff: number };

export interface TurretStats {
  range: number;
  /** Damage per shot (per second for the cone; ignored by the beam, which kills a member per shot). */
  damage: number;
  shotsPerSecond: number;
  /** Degrees per second the turret swivels. */
  turnRate: number;
}

export interface TurretType {
  id: TurretKind;
  name: string;
  /** Short symbol, the same on the map, in the build bar and in research (#2). */
  symbol: string;
  /** Colour of the turret's ring and its shots. */
  color: string;
  damageType: DamageType;
  pattern: Pattern;
  base: TurretStats;
}

export const TURRET_TYPES: readonly TurretType[] = [
  { id: "cannon", color: "#edf2f4", name: "Kanone", symbol: "●", damageType: "kinetic", pattern: { kind: "single" }, base: { range: 4, damage: 1, shotsPerSecond: 3, turnRate: 240 } },
  { id: "mortar", color: "#f2c14e", name: "Mörser", symbol: "◎", damageType: "explosive", pattern: { kind: "splash", radius: 1.2 }, base: { range: 6, damage: 1.5, shotsPerSecond: 0.8, turnRate: 120 } },
  { id: "flamer", color: "#ff7b39", name: "Flammenwerfer", symbol: "▲", damageType: "fire", pattern: { kind: "cone", angle: 50, burnSeconds: 2 }, base: { range: 2.5, damage: 2, shotsPerSecond: 1, turnRate: 180 } },
  { id: "laser", color: "#ff5d8f", name: "Laser", symbol: "◆", damageType: "energy", pattern: { kind: "beam" }, base: { range: 5, damage: 0, shotsPerSecond: 1.5, turnRate: 360 } },
  { id: "tesla", color: "#7fdbff", name: "Tesla", symbol: "✦", damageType: "electric", pattern: { kind: "chain", jumps: 3, reach: 2, falloff: 0.7 }, base: { range: 3.5, damage: 1, shotsPerSecond: 1.2, turnRate: 360 } },
];

export function turretType(id: TurretKind): TurretType {
  return TURRET_TYPES.find((t) => t.id === id)!;
}
