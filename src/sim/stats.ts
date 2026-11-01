/**
 * What a run counts for its analysis (#32): who broke through where, who killed what, how the goals drained.
 * Only counting: nothing here feeds back into the simulation, so a run plays exactly as without it.
 */

/** Whatever deals damage: a turret, burning, the precision shot, or a hit from outside (tests). */
export interface Credit {
  /** Enemies killed. */
  kills: number;
  /** Shield and hit points taken off, after resistances (overkill not counted). */
  damage: number;
}

export interface RunStats {
  /** Enemies per type that came out of a spawn. */
  spawned: Record<string, number>;
  /** Enemies per type that were killed. */
  killed: Record<string, number>;
  /** Enemies per type that reached a goal, per goal index. */
  arrived: Record<string, number[]>;
  /** Burning after flame and fire bomb ("Brand"). */
  burn: Credit;
  /** The player's precision shot ("Präzisionsschuss"). */
  ability: Credit;
  /** Damage from outside the run's own sources (tests calling hit directly). */
  other: Credit;
  /** Energy per goal, one sample per second of the run and one at its end; sample 0 is the start. */
  energy: number[][];
}

/** Ticks between two energy samples: one per second at DT = 1/30. */
export const SAMPLE_TICKS = 30;

export function createStats(goals: number, energy: number): RunStats {
  return {
    spawned: {},
    killed: {},
    arrived: {},
    burn: { kills: 0, damage: 0 },
    ability: { kills: 0, damage: 0 },
    other: { kills: 0, damage: 0 },
    energy: Array.from({ length: goals }, () => [energy]),
  };
}

export function sampleEnergy(s: RunStats, energies: readonly number[]): void {
  for (let i = 0; i < energies.length; i++) s.energy[i]!.push(energies[i]!);
}

export function countArrived(s: RunStats, type: string, goal: number, goals: number, n: number): void {
  const at = s.arrived[type] ?? (s.arrived[type] = new Array<number>(goals).fill(0));
  at[goal]! += n;
}
