# Lock-in test for homepage date-filter default

**PR**: TBD
**Date**: 2026-04-25

## Changes
- `frontend/test-all.spec.ts` — adds `Homepage > "listings under each poster default to today and follow the day strip"`. On initial load, collects every `<time datetime>` in the desktop hybrid grid, converts each to London civil date, and asserts every value equals today. Then clicks the next-day strip button and asserts the visible set narrows to a single non-today date.

## Why
Reviewer feedback on #445 (the homepage date-filter default fix) flagged that the verification ("190 → 116 screening times") lived only in the changelog, not in a checked-in test. The next refactor of the `filmMap` derivation could silently re-introduce either of the two original bugs:
1. The `||` short-circuit returning, leaking the full 30-day payload into the desktop grid.
2. The UTC-string-slice path re-emerging, causing late-night BST screenings to land on the wrong calendar day.

This single test case bites on both: a leaked future-day screening or a UTC/London mismatch produces a `datetime` whose London-date != today, failing the assertion.

## Impact
- **No production code change.** Tests-only.
- The test runs against real production data via the existing dev-server proxy — no fixtures needed because today's London date is computed from the same `Intl.DateTimeFormat` semantics the page itself uses.
- Verified against the local dev server: passes in 2.5 s.

## Files
- `frontend/test-all.spec.ts`
