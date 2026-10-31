import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: false },
  server: { proxy: { "/api": "http://localhost:3000", "/healthz": "http://localhost:3000" } },
  test: { environment: "node", include: ["test/**/*.test.ts"], fileParallelism: false },
});
