import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/balance/*.run.ts"], disableConsoleIntercept: true },
});
