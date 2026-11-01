import type { DamageType } from "./enemies.ts";

export type TurretKind =
  | "cannon" | "mortar" | "flamer" | "laser" | "tesla" | "gatling"
  | "rocket" | "napalm" | "railgun" | "frost" | "breaker" | "shrapnel";

/** How a weapon delivers its damage. */
export type Pattern =
  | { kind: "single" }
  | { kind: "splash"; radius: number; burnSeconds?: number }
  | { kind: "pierce"; width: number }
  | { kind: "slow"; radius: number; factor: number; seconds: number }
  | { kind: "cone"; angle: number; burnSeconds: number }
  | { kind: "beam" }
  | { kind: "chain"; jumps: number; reach: number; falloff: number };

export interface TurretStats {
  range: number;
  /** Damage per shot (per second for the cone). For the beam also the hit points up to which a shot kills outright. */
  damage: number;
  shotsPerSecond: number;
  /** Degrees per second the turret swivels. */
  turnRate: number;
  /**
   * Width in degrees of the wedge the turret can cover around its facing (#41). Starts at START_ARC and grows with
   * research up to MAX_ARC; the player only sets the facing. Missing = all round (hand-built arsenals in tests).
   */
  arc?: number;
}

export const START_ARC = 20;
export const MAX_ARC = 180;

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
  { id: "mortar", color: "#f2c14e", name: "Mörser", symbol: "◎", damageType: "explosive", pattern: { kind: "splash", radius: 1.2 }, base: { range: 6, damage: 2.5, shotsPerSecond: 1.2, turnRate: 120 } },
  { id: "flamer", color: "#ff7b39", name: "Flammenwerfer", symbol: "▲", damageType: "fire", pattern: { kind: "cone", angle: 50, burnSeconds: 2 }, base: { range: 2.5, damage: 2, shotsPerSecond: 1, turnRate: 180 } },
  { id: "laser", color: "#ff5d8f", name: "Laser", symbol: "◆", damageType: "energy", pattern: { kind: "beam" }, base: { range: 5, damage: 6, shotsPerSecond: 1, turnRate: 360 } },
  { id: "tesla", color: "#7fdbff", name: "Tesla", symbol: "✦", damageType: "electric", pattern: { kind: "chain", jumps: 3, reach: 2, falloff: 0.7 }, base: { range: 3.5, damage: 1.5, shotsPerSecond: 1.5, turnRate: 360 } },
  { id: "gatling", color: "#c3b1e1", name: "Gatling", symbol: "✱", damageType: "kinetic", pattern: { kind: "single" }, base: { range: 3.5, damage: 0.4, shotsPerSecond: 12, turnRate: 300 } },
  { id: "rocket", color: "#f4a261", name: "Rakete", symbol: "➤", damageType: "explosive", pattern: { kind: "splash", radius: 2 }, base: { range: 9, damage: 4, shotsPerSecond: 0.6, turnRate: 70 } },
  { id: "napalm", color: "#e76f51", name: "Brandbombe", symbol: "✹", damageType: "fire", pattern: { kind: "splash", radius: 1.5, burnSeconds: 3 }, base: { range: 5, damage: 1.5, shotsPerSecond: 0.9, turnRate: 90 } },
  { id: "railgun", color: "#90e0ef", name: "Railgun", symbol: "▮", damageType: "kinetic", pattern: { kind: "pierce", width: 0.4 }, base: { range: 10, damage: 3.5, shotsPerSecond: 0.9, turnRate: 60 } },
  { id: "frost", color: "#a8dadc", name: "Frost", symbol: "❄", damageType: "energy", pattern: { kind: "slow", radius: 1.2, factor: 0.5, seconds: 2 }, base: { range: 4, damage: 1.2, shotsPerSecond: 1.2, turnRate: 180 } },
  { id: "breaker", color: "#9b5de5", name: "Schildbrecher", symbol: "⬢", damageType: "electric", pattern: { kind: "single" }, base: { range: 4, damage: 2, shotsPerSecond: 1.6, turnRate: 220 } },
  { id: "shrapnel", color: "#d4d700", name: "Splitter", symbol: "✚", damageType: "kinetic", pattern: { kind: "splash", radius: 0.8 }, base: { range: 3, damage: 1, shotsPerSecond: 4, turnRate: 220 } },
];

export function turretType(id: TurretKind): TurretType {
  return TURRET_TYPES.find((t) => t.id === id)!;
}
