import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    // Use jsdom for component tests, node for pure logic
    environment: "jsdom",
    // Include both .ts and .tsx test files
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Exclude E2E tests (those are run by Playwright)
    exclude: ["e2e/**", "node_modules/**"],
    // Setup files run before each test file
    setupFiles: ["./src/test/setup.ts"],
    // Coverage configuration
    coverage: {
      reporter: ["text", "html", "json-summary"],
      include: [
        "src/lib/**",
        "src/scrapers/utils/**",
        "src/stores/**",
        "src/app/api/**",
        "src/components/**",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/test/**",
        "**/*.d.ts",
      ],
      // Coverage thresholds - start low to prevent regression, increase over time
      // Current: ~12% lines, ~11% functions. Target: 60%
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 8,
        statements: 10,
      },
    },
    // Timeout for slow tests
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
