# Add unit tests for discovery Zustand store

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/stores/discovery.test.ts` (new) — 9 cases for the discovery / onboarding-banner store.

## Coverage
- Default state (both flags false, dismissedAt null)
- markFeatureVisited sets only the specified flag
- dismissBanner stamps ISO timestamp
- shouldShowBanner: true initially, false after both features visited, true with only one, false after manual dismissal
- resetDiscovery reverts to defaults

## Why
This store gates the onboarding banner that introduces the Reachable and Map features. A regression that flips the shouldShowBanner logic either:
- Hides the banner from new users (no discovery → no engagement)
- Shows it forever to existing users (annoyance / repeat dismissals)

The "EITHER visit both OR dismiss" precedence is what makes the banner feel non-naggy — pinned by the test.

## Changelog deferral note
Per #523-#530.
