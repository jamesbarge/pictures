# Add unit tests for src/lib/geo-utils.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/geo-utils.test.ts` (new) — 13 vitest cases covering `isCinemaInArea` and `getCinemasInArea`.

## Coverage
### `isCinemaInArea(coords, area)`
- Cinema inside polygon → true
- Cinema outside polygon → false
- Null coordinates → false
- Null area → false
- Polygon with < 3 paths → false (pin the guard against degenerate polygons)
- Polygon with empty paths array → false
- Auto-closes polygons: callers don't need to repeat the first point as the last
- On-edge points don't throw (Turf.js behaviour is implementation-defined; no assertion of true/false)

### `getCinemasInArea(cinemas, area)`
- `area === null` → returns cinemas unchanged (no filter)
- Filters to only cinemas inside the polygon
- Skips cinemas with null coordinates
- Returns empty array when no matches
- Preserves input order

## Why
`geo-utils` powers the map-area filter — when a user draws a polygon on the cinema map, this module determines which cinemas to include in results. A regression in `isCinemaInArea` either shows too many cinemas (false positives on the polygon boundary) or hides legitimate ones (false negatives from a broken null guard).

The polygon-auto-close behaviour is the most surprising aspect: callers supply N vertices, the implementation pushes the first vertex again before handing to Turf. A naive refactor that "fixes" this by requiring callers to supply a closed polygon would break every existing call site silently.

## Impact
- Functional: none. Pure test addition.
- Coverage: lifts a 58-line untested geospatial module to 100% line coverage.
- Future-proofing: pins the auto-close convention and the < 3 paths guard.

## Verification
`npx vitest run src/lib/geo-utils.test.ts` — 13 passed, 0 failed, 782ms.

## Changelog deferral note
Per the workflow pattern from PR #523/#524, this PR omits the `RECENT_CHANGES.md` top-of-file entry to avoid the rebase-conflict cascade caused by multiple in-flight session PRs each editing line 1. A follow-up batch PR will catch up `RECENT_CHANGES.md` for this and other session PRs.
