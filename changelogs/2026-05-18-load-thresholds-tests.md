# Add unit tests for src/lib/data-quality/load-thresholds.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/data-quality/load-thresholds.test.ts` (new) — 8 vitest cases.

## Coverage
- Full Thresholds shape (5 sub-objects)
- All tmdb fields are numbers
- Dodgy-detection bounds in plausible ranges (year > 1800, maxYear > minYear, runtime > 0)
- **Pinned identity caching**: repeated `loadThresholds()` calls return the same reference (module-scope cached). Pinned so a refactor doesn't reintroduce per-call I/O.
- **Pinned `$comment` strip**: JSON metadata field is removed in the IIFE that builds STATIC_THRESHOLDS.
- safetyFloors similarity values are in [0,1]
- Async variant returns identical reference to sync variant
- Async variant doesn't throw

## Why
Thresholds drive the entire data-quality pipeline (TMDB matching cutoffs, duplicate detection, non-film pattern budgets). The module-scope caching is load-bearing because hot paths call `loadThresholds()` per row — moving back to per-call I/O would balloon scrape runtime. The `$comment` strip is also load-bearing — without it, callers would see an unexpected key when iterating Thresholds.

## Changelog deferral note
Per #523-#530.
