import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: [process.env.BALANCE_RUN ?? "test/balance/report.run.ts"], disableConsoleIntercept: true },
});
