import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: false },
  test: { environment: "node", include: ["test/**/*.test.ts"], fileParallelism: false },
});
