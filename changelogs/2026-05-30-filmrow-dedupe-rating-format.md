# FilmRow: compute tmdbRating.toFixed(1) once

**PR**: #124
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/components/search/rows/FilmRow.svelte`, `film.tmdbRating.toFixed(1)` was computed twice: once in the `aria-label="TMDB rating {...}"` and once in the visible `★ {...}` text.
- Introduced `const rating = $derived(film.tmdbRating != null ? film.tmdbRating.toFixed(1) : null)` and reused `rating` in both the `aria-label` and the visible label.
- The render gate is now `rating != null && film.tmdbRating != null && film.tmdbRating >= 7` (the `film.tmdbRating != null` clause is retained so TypeScript narrows `film.tmdbRating` to a non-null number for the `>= 7` comparison; it is logically equivalent to `rating != null`).

## Impact
- Affects the search/command palette film result rows only. No visual, textual, or accessibility-string change.

## Behavior preservation
- `rating != null` is exactly equivalent to `film.tmdbRating != null`, so the combined render condition is logically identical to the original `film.tmdbRating != null && film.tmdbRating >= 7`.
- When rendered, `rating` holds the same string as `film.tmdbRating.toFixed(1)`, so both the `aria-label` and visible `★ ...` text are byte-for-byte identical to before. The label and value now share a single source and can never drift.
- Verified with `svelte-check --threshold error`: 0 errors.
