import { createServer } from "node:http";
import pg from "pg";
import { createApp } from "./app.ts";
import { createPgStore } from "./store.ts";

// pg reads PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE from the environment.
const pool = new pg.Pool();
const store = createPgStore(pool);
const port = Number(process.env.PORT ?? 3000);
const distDir = process.env.DIST_DIR ?? new URL("../dist", import.meta.url).pathname;

for (let attempt = 1; ; attempt++) {
  try {
    await store.migrate();
    break;
  } catch (err) {
    if (attempt >= 30) throw err;
    console.warn(`database not ready (attempt ${attempt}): ${(err as Error).message}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const server = createServer(createApp({ store, distDir }));
server.listen(port, () => console.log(`flow defense listening on :${port}, serving ${distDir}`));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
