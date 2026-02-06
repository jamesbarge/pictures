# Film Detail Initial Date Filter Derivation

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Replaced effect-based one-time date filter initialization in:
  - `src/components/film/film-screenings.tsx`
- Added `getInitialSelectedDates(...)` helper to derive initial selected date pills from:
  - available film screening dates
  - persisted global `dateFrom`/`dateTo` filters
- Initialized local film-detail filter state with derived selected dates instead of mutating state from an effect.

## Impact
- Eliminates `setState`-in-effect usage in film detail screening filters.
- Preserves persisted filter carry-over behavior from homepage to film detail page.
- Keeps initial screening narrowing deterministic and easier to reason about.
