import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  test: {
    include: ["scripts/typesafe-experiments/*.test.ts"],
    environment: "node",
    pool: "threads",
    maxWorkers: 2,
    testTimeout: 10_000,
  },
});
