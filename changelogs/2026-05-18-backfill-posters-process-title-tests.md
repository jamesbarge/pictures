# Add unit tests for backfill-posters processTitle

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/db/backfill-posters-process-title.test.ts` (new) — 8 cases for the `processTitle` pure helper from the poster-backfill job.

## Coverage
- Clean title passthrough
- Non-film event short-circuit (early return)
- HTML entity decode (&amp; / &quot; / &#39;)
- `X presents "Y"` extraction pattern
- Whitespace trim
- Year null when absent
- changes array always defined (never undefined)
- Full ProcessedTitle shape (all 6 fields present)

## Why
processTitle runs once per film in the nightly poster-backfill job. A regression silently produces wrong TMDB lookups (chasing the wrong title) or misclassifies legitimate films as non-film events. The "presents X" pattern is particularly load-bearing — it's how Funeral Parade / Saturday Morning Picture Club screenings get matched.

## Changelog deferral note
Per #523-#530.
