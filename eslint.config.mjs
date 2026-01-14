import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Rule overrides - temporarily downgrade problematic rules to warnings
  // TODO: Fix these issues incrementally and remove these overrides
  {
    rules: {
      // Migration scripts assign to module.exports pattern - fix incrementally
      "@next/next/no-assign-module-variable": "warn",
      // React Compiler strict mode rule - fix incrementally
      "react-hooks/set-state-in-effect": "warn",
      // Test files use any for mocking - fix incrementally
      "@typescript-eslint/no-explicit-any": "warn",
      // Ban ts-comment but allow ts-expect-error with description
      "@typescript-eslint/ban-ts-comment": ["warn", {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": true,
        "ts-nocheck": true,
      }],
    },
  },
]);

export default eslintConfig;
