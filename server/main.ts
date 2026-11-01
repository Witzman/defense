import { createServer } from "node:http";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const distDir = process.env.DIST_DIR ?? new URL("../dist", import.meta.url).pathname;

const server = createServer(createApp({ distDir }));
server.listen(port, () => console.log(`flow defense listening on :${port}, serving ${distDir}`));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
