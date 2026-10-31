import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/balance/report.run.ts"], disableConsoleIntercept: true },
});
