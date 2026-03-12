/**
 * Feature Flags
 * Reads NEXT_PUBLIC_ENABLE_* environment variables.
 * Values are inlined at build time by Next.js.
 */

const FEATURE_FLAGS = {
  seasons: process.env.NEXT_PUBLIC_ENABLE_SEASONS === "true",
  festivals: process.env.NEXT_PUBLIC_ENABLE_FESTIVALS === "true",
} as const;

type FeatureName = keyof typeof FEATURE_FLAGS;

/** Return `true` if the given feature flag is enabled at build time. */
export function isFeatureEnabled(feature: FeatureName): boolean {
  return FEATURE_FLAGS[feature];
}
