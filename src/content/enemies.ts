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
  /**
   * How strongly the type keeps to deep water (#27): a cell on the shore costs it (1 + depthPreference) times its
   * length, falling to 1 in deep water (sim/world.ts). 0 = indifferent, takes every shortcut along the shore.
   * A cost, never a wall: a shallow channel stays passable when it is the only way.
   */
  depthPreference: number;
}

/** Electric damage against shields counts this many times over. */
export const SHIELD_BREAKER = 3;

// Depth preference (#27, owner: Fels keeps strictly to deep water, Schwarm takes every shortcut). Fels is the heavy,
// slow one: a shore cell costs it 5 times, so it goes a long way round to stay deep. Panzer is heavy too, but less.
// Grünling, Glut and Schildträger keep a mild distance from the shore; they share one value, so one route field.
// Schwarm is small and fast and hugs the inside of every bend. Few distinct values keep the route fields few.
export const ENEMY_TYPES: readonly EnemyType[] = [
  { id: "green", name: "Grünling", color: "#a7d64a", edge: "#6f9a24", hp: 1, shield: 0, speed: 1, resist: {}, depthPreference: 1 },
  { id: "armor", name: "Panzer", color: "#5aa9e6", edge: "#2f6f9f", hp: 2, shield: 0, speed: 0.85, resist: { kinetic: 0.6 }, depthPreference: 2 },
  { id: "ember", name: "Glut", color: "#f28c38", edge: "#b0561a", hp: 1.2, shield: 0, speed: 1, resist: { fire: 1 }, depthPreference: 1 },
  { id: "shield", name: "Schildträger", color: "#b388eb", edge: "#7a52b3", hp: 1, shield: 2, speed: 0.9, resist: {}, depthPreference: 1 },
  { id: "swarm", name: "Schwarm", color: "#f6e05e", edge: "#b7a02a", hp: 0.5, shield: 0, speed: 1.6, resist: {}, depthPreference: 0 },
  { id: "rock", name: "Fels", color: "#9aa5b1", edge: "#5f6b78", hp: 2.5, shield: 0, speed: 0.6, resist: { explosive: 0.5, kinetic: 0.3 }, instantKillImmune: true, depthPreference: 4 },
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
