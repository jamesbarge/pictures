# Kaizen — Remove Dead Code in Components

**PR**: #273
**Date**: 2026-03-13

## Changes
- Deleted `useIsAdminUser()` from posthog-provider.tsx — React hook with zero callers anywhere
- Removed `export` from `ScreeningEventSchema` in json-ld.tsx — only used internally by `ScreeningEventsSchema`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
