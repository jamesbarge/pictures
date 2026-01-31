/**
 * Feature Flags
 * Reads NEXT_PUBLIC_ENABLE_* environment variables.
 * Values are inlined at build time by Next.js.
 */

const FEATURE_FLAGS = {
  seasons: process.env.NEXT_PUBLIC_ENABLE_SEASONS === "true",
} as const;

type FeatureName = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(feature: FeatureName): boolean {
  return FEATURE_FLAGS[feature];
}
