# Add unit tests for src/lib/tmdb/ambiguity.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/tmdb/ambiguity.test.ts` (new) — 14 vitest cases for `analyzeTitleAmbiguity`, `isAmbiguousTitle`, `hasSufficientMetadata`.

## Why
Ambiguity scoring drives the metadata-requirement gate for TMDB matching. A regression that under-scores ambiguous titles ("Crash", "It", "1984") leads to wrong-film matches in the calendar. A regression that over-scores common titles inflates manual-review queue size.

The `hasSufficientMetadata` function gates whether the matcher proceeds — its accept/reject decisions directly affect what shows up in the admin "needs review" queue.

## Coverage
- Single-word titles flagged + requiresReview always true (independent of score threshold)
- Two-word "Short title" reasoning
- Very-short-character + single-word reason accumulation
- 'The X' pattern detection
- Long unambiguous titles → low score, no review
- Score cap at 1.0
- Reasons deduplication
- Year-pattern titles
- isAmbiguousTitle predicate matches analyzeTitleAmbiguity.requiresReview
- hasSufficientMetadata: unambiguous → always-accept; highly-ambiguous → needs BOTH year+director; moderately-ambiguous → needs at least one

## Changelog deferral note
Per #523-#530.
