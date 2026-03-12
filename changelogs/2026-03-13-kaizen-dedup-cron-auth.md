# Kaizen — Deduplicate Cron Auth

**PR**: #242
**Date**: 2026-03-13

## Changes
- Extracted `verifyCronSecret()` function from 3 cron route handlers into shared `src/lib/auth.ts`
- Removed identical local implementations from `cleanup/route.ts` and `posthog-sync/route.ts`
- Replaced inline auth check in `health-check/route.ts` with shared function

## Impact
- Code quality improvement, no behavior changes
- Eliminates duplicated auth logic across cron routes — future cron routes import from one place
- Kaizen category: duplicate-pattern
