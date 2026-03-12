# Kaizen — Extract STALE_TIME_MS Constant in Calendar Loader

**PR**: #XX
**Date**: 2026-03-13

## Changes
- `src/components/calendar/calendar-view-loader.tsx`: Extracted `5 * 60 * 1000` (used 5 times as `staleTime` in React Query hooks) into a single `STALE_TIME_MS` constant with JSDoc

## Impact
- Code quality improvement, no behavior changes
- Makes the cache strategy explicit and changeable in one place
- Kaizen category: extract-constant
