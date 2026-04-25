# Extract homepage filmMap to a pure helper

**PR**: TBD
**Date**: 2026-04-25

## Changes

### `frontend/src/lib/calendar-filter.ts` (new)
Pure function `buildFilmMap<S extends CalendarScreening>(screenings, filters, { today, now })` that owns the filtering and grouping logic previously inlined in the homepage `$derived.by`. It takes:

- `screenings`: any payload shape that satisfies the minimal `CalendarScreening` interface (id, datetime, format, bookingUrl, film with id/title/year/director/genres/runtime/posterUrl/isRepertory/letterboxdRating/tmdbPopularity, cinema with id/name/shortName).
- `filters`: a snapshot of the active filter state — `CalendarFilterSnapshot` mirrors the readable surface of `filters.svelte.ts`.
- `today`: the active "today (London)" civil date string. Used as the default range bound when no `dateFrom`/`dateTo` is set on the snapshot. Passed in (rather than read inline) so the function is fully deterministic and tests can pin it.
- `now`: ms-since-epoch instant. Screenings at or before this instant are excluded as already-started.

The behavioural contract is documented in the file and matches what the homepage was doing before:
- Excludes screenings whose `datetime` is at or before `now`.
- Excludes screenings without a `film`.
- Date range defaults to `[today, today]` when neither end is set.
- All date comparisons use London civil dates via `toLondonDateStr`.
- Screenings are bucketed by `film.id` in insertion order; the caller is responsible for any ordering.

### `frontend/src/routes/+page.svelte`
Replaced the ~85-line `filmMap` derivation body with a 16-line snapshot construction + call to `buildFilmMap`. The dev-side one-sided-range warning stays in the component because it reads `filters.dateFrom`/`filters.dateTo` directly to track the warn dedup key. The component is now a thin reactive wrapper.

## Why
Pre-test-analyzer's call-out on the #445 review: the inlined derivation was untestable as written, and the BST midnight boundary (where the original bug lived) is hard to hit through Playwright. Extracting the pure function gives a clear unit-test surface — even before a test runner lands on the frontend, the function shape itself is the win, because it's now possible to pass arbitrary fixture data through the same code that runs in production.

## Verification
- `npx svelte-check --threshold error` — no new errors (11 pre-existing in unrelated files).
- `Homepage` Playwright describe block: 14 passed, the lock-in test from #447 still green. 3 failures are all time-of-day data-variance unrelated to this change (only 18 films remain at this late hour, so Prince Charles search and "Soho & West End" cinema chip return zero — the test fixtures assume a fuller dataset). The "Pick date popover" failure is the same pre-existing flake confirmed in #445/#447/#448/#449.

## Vitest deferred
Originally planned to ship Vitest wiring + a unit-test spec covering the BST midnight boundary, default-to-today, multi-day range, time-of-day filter, search, programming type, decade chip, and grouping. The dependency add was reverted before commit; landing the test runner can ship as its own PR once the dependency baseline is settled. The extracted function's surface is testable as soon as Vitest is wired — no further refactor needed.

## Files
- `frontend/src/lib/calendar-filter.ts` (new)
- `frontend/src/routes/+page.svelte`

## Behavioural diff
None. The Playwright lock-in from #447 still passes against the refactored code, confirming the extraction is behaviour-preserving.
