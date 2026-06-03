# Add unit tests for src/lib/filter-constants.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/filter-constants.test.ts` (new) — 28 vitest cases covering 9 exported functions: `isProgrammingType`, `isTimeOfDay`, `getTimeOfDayLabel`, `getTimeOfDayFromHour`, `getProgrammingTypeLabel`, `isIndependentCinema`, `formatHour`, `formatTimeRange`, `matchesTimePreset`.

## Why
These functions drive the time-of-day / programming-type filter UI on both frontend and backend. The hour-bucket boundaries (`< 12`, `< 17`, `< 21`) and the `to + 1` "end-of-hour" convention in `formatTimeRange` are non-obvious — a maintainer changing the boundary by one hour silently changes which screenings appear under each filter.

## Pinned surprising contracts
1. **`formatTimeRange` uses `to + 1` semantics** — `to: 16` means "up to and including 4pm" but displays as "5pm" (end-of-hour). Captured in the "12-16 → 12pm - 5pm" test.
2. **`isIndependentCinema` returns true for BFI** — even though BFI has a chain value, it's treated as independent. Pinned with a comment.
3. **Type guards are case-sensitive** — `"Repertory"` and `"bfi"` do NOT match (test cases pin this).

## Impact
- Functional: none. Pure test addition.
- Coverage: 140-line untested filter helper → 9 functions fully covered.

## Verification
`npx vitest run src/lib/filter-constants.test.ts` — 28 passed, 0 failed, 593ms.

## Changelog deferral note
Per #523-#530, omits the `RECENT_CHANGES.md` top-of-file entry. Batched next.
