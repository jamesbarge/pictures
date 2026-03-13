# Kaizen — Delete 6 Dead Analytics Functions

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed 6 unused exported functions from `src/lib/analytics.ts`:
  - `trackCinemaSelection` — never wired into cinema filter components
  - `getFeatureFlagValue` / `getFeatureFlagPayload` — feature flag helpers never adopted (app uses `isFeatureEnabled` instead)
  - `setUserProperties` / `setUserPropertiesOnce` — generic property setters unused (app uses `syncUserEngagementProperties` directly)
  - `incrementUserProperty` — numeric increment never adopted

## Impact
- Code quality improvement, no behavior changes
- Reduces analytics API surface from 25 to 19 exports, making actual tracking easier to audit
- Kaizen category: dead-code
