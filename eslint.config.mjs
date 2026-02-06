import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Accessibility linting - strengthen a11y rules from eslint-config-next
  // The jsx-a11y plugin is already registered by eslint-config-next
  {
    rules: {
      // Critical: Elements must have accessible names
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      // Important: Interactive elements must be keyboard accessible
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      // Labels and form accessibility
      "jsx-a11y/label-has-associated-control": "warn",
      // Anchors must have content
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "warn",
      // Heading hierarchy
      "jsx-a11y/heading-has-content": "error",
      // Media accessibility
      "jsx-a11y/media-has-caption": "warn",
      // Scope attribute only on th elements
      "jsx-a11y/scope": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local one-off analysis scripts
    ".tmp-*.js",
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
