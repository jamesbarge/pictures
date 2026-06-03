# Add unit tests for pure helpers in tmdb/match.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/tmdb/match-pure-fns.test.ts` (new) — 14 cases for `isRepertoryFilm` + `getDecade`.

## Why
`isRepertoryFilm` drives the "REPERTORY / NEW RELEASE" badge on every film card AND the programming-type filter pipe. A regression flips repertory labels across the calendar (false-positive: new releases show as repertory; false-negative: classics show as new).

`getDecade` powers the decade filter chips.

## Coverage
- isRepertoryFilm: undefined/empty → false, current/last-year → false, 2+ years old → true; yyyy-MM-dd format; year-only string; NaN-year fallback to false
- getDecade: year-0/year-9 of decade, millennium boundary, pre-1900

## Changelog deferral note
Per #523-#530.
