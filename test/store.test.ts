import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgStore, createPool } from "../server/store.ts";

// Runs against a real Postgres. CI provides one; locally set PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.
const hasDb = Boolean(process.env.PGHOST);
if (process.env.CI && !hasDb) throw new Error("CI must provide Postgres (PGHOST)");

describe.skipIf(!hasDb)("pg store", () => {
  const pool = createPool();
  const store = createPgStore(pool);

  beforeAll(async () => {
    await store.migrate();
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM saves");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("returns null for a slot that was never saved", async () => {
    expect(await store.load("global")).toBeNull();
  });

  it("returns what was saved, and the last save wins", async () => {
    await store.save("global", { version: 1, points: 3 });
    await store.save("global", { version: 1, points: 7 });
    expect(await store.load("global")).toEqual({ version: 1, points: 7 });
  });

  it("keeps slots apart", async () => {
    await store.save("global", { version: 1, points: 1 });
    expect(await store.load("other")).toBeNull();
  });

  it("migrate can run twice", async () => {
    await store.migrate();
  });

  it("survives the database dropping an idle connection", async () => {
    await store.healthy();
    const admin = new pg.Client();
    await admin.connect();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
    await admin.end();
    await new Promise((r) => setTimeout(r, 100));
    expect(await store.healthy()).toBe(true);
  });

  it("reports health while the database answers", async () => {
    expect(await store.healthy()).toBe(true);
  });
});
