import type pg from "pg";

export type SaveData = Record<string, unknown>;

export interface Store {
  migrate(): Promise<void>;
  load(slot: string): Promise<SaveData | null>;
  save(slot: string, data: SaveData): Promise<void>;
  healthy(): Promise<boolean>;
}

/** Save games in Postgres, one row per slot. The prototype uses the slot "global"; with login it becomes the user id. */
export function createPgStore(pool: pg.Pool): Store {
  return {
    async migrate() {
      await pool.query(`CREATE TABLE IF NOT EXISTS saves (
        slot text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    },
    async load(slot) {
      const res = await pool.query<{ data: SaveData }>("SELECT data FROM saves WHERE slot = $1", [slot]);
      return res.rows[0]?.data ?? null;
    },
    async save(slot, data) {
      await pool.query(
        `INSERT INTO saves (slot, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (slot) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [slot, JSON.stringify(data)],
      );
    },
    async healthy() {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
  };
}
