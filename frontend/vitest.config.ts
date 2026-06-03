import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, "./src/lib"),
      $app: resolve(__dirname, "./.svelte-kit/runtime/app"),
    },
  },
});
