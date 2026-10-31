/** Damage types. Every enemy resistance and every weapon names one of these. */
export type DamageType = "kinetic" | "explosive" | "fire" | "energy" | "electric";
export const DAMAGE_TYPES: readonly DamageType[] = ["kinetic", "explosive", "fire", "energy", "electric"];

export interface EnemyType {
  id: string;
  name: string;
  /** Fill colour: the colour is how the player tells types apart (#2). */
  color: string;
  edge: string;
  /** Hit points per member, before the level's scaling. */
  hp: number;
  /** Shield points per member; damage hits the shield first. */
  shield: number;
  /** Multiplier on the level's speed. */
  speed: number;
  /** Share of damage of a type that is ignored: 0.6 = takes 40 %, 1 = immune. */
  resist: Partial<Record<DamageType, number>>;
  /** Shrugs off instant kills (laser contact). */
  instantKillImmune?: boolean;
}

/** Electric damage against shields counts this many times over. */
export const SHIELD_BREAKER = 3;

export const ENEMY_TYPES: readonly EnemyType[] = [
  { id: "green", name: "Grünling", color: "#a7d64a", edge: "#6f9a24", hp: 1, shield: 0, speed: 1, resist: {} },
  { id: "armor", name: "Panzer", color: "#5aa9e6", edge: "#2f6f9f", hp: 2, shield: 0, speed: 0.85, resist: { kinetic: 0.6 } },
  { id: "ember", name: "Glut", color: "#f28c38", edge: "#b0561a", hp: 1.2, shield: 0, speed: 1, resist: { fire: 1 } },
  { id: "shield", name: "Schildträger", color: "#b388eb", edge: "#7a52b3", hp: 1, shield: 2, speed: 0.9, resist: {} },
  { id: "swarm", name: "Schwarm", color: "#f6e05e", edge: "#b7a02a", hp: 0.5, shield: 0, speed: 1.6, resist: {} },
  { id: "rock", name: "Fels", color: "#9aa5b1", edge: "#5f6b78", hp: 2.5, shield: 0, speed: 0.6, resist: { explosive: 0.5, kinetic: 0.3 }, instantKillImmune: true },
];

export function enemyType(id: string): EnemyType {
  const t = ENEMY_TYPES.find((e) => e.id === id);
  if (!t) throw new Error(`unknown enemy type ${id}`);
  return t;
}

/** Share of damage of `type` that reaches the enemy (0 = immune). */
export function vulnerability(t: EnemyType, type: DamageType): number {
  return 1 - Math.min(1, Math.max(0, t.resist[type] ?? 0));
}
