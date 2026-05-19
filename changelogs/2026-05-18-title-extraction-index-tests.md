# Add unit tests for src/lib/title-extraction/index.ts (cache primitives)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/title-extraction/index.test.ts` (new) — 9 vitest cases for `extractFilmTitle`, `extractFilmTitleCached`, `clearTitleCache`, `batchExtractTitles`.

## Coverage
- extractFilmTitle: returns AIExtractionResult with filmTitle + confidence ∈ {high, medium, low}
- extractFilmTitleCached: reference-equal on cache hit, different objects for different keys
- **Pinned cache-key contract**: cache is case-sensitive on the RAW input string (no normalisation)
- clearTitleCache: subsequent call returns a fresh instance (cache invalidated)
- batchExtractTitles: Map keyed by raw title, dedup via Set, empty-input handling

## Why
This module is the **single entry point** for title extraction across the entire scraper pipeline (`extractFilmTitleCached` is called once per scraped film). A regression in the cache primitives either:
- Returns stale data for a re-scraped venue (false hit on case-sensitivity)
- Bypasses the cache (silently O(n²) instead of O(n))
- Loses cache-clear semantics needed by long-running pipelines

The case-sensitivity test in particular pins a non-obvious choice — a future refactor that switches to lowercase keys would silently change cache hit rates.

## Changelog deferral note
Per #523-#530.
