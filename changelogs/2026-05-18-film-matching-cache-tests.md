# Add unit tests for film-matching cache primitives

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/utils/film-matching-cache.test.ts` (new) — 7 vitest cases for `lookupFilmInCache` + `logCacheStats`.

## Why
The film cache is loaded once per pipeline run and queried O(1) for every screening across every cinema. A regression in lookup behaviour (e.g. a stat-counter swap) would mis-report cache effectiveness; a regression in the format string would break grep-based dashboards.

The pure functions are easy to test; the bigger surface (initFilmCache, findFilmBySimilarity, matchAndCreateFromTMDB) needs full Drizzle mocks and is out of scope here.

## Coverage
- lookupFilmInCache: hit increments stats.hits, miss returns null + increments stats.misses, exact-only matching (no fuzzy fallback), accumulation across calls
- logCacheStats: hit-rate formatting, divide-by-zero guard (0/0 → 0% not NaN%), 1-decimal precision

## Changelog deferral note
Per #523-#530.
