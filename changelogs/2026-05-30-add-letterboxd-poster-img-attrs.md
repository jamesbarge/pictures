# Add width/height + loading/decoding + srcset to the Letterboxd matched-film poster img

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Imported `getPosterImageAttributes` from `$lib/utils` into `frontend/src/routes/letterboxd/+page.svelte`.
- Inside the `{#if film.posterUrl}` block of the matched-film grid, added an `@const posterImage = getPosterImageAttributes(film.posterUrl, { baseSize: 'w154', srcSetSizes: ['w92', 'w154'], sizes: '64px' })`.
- Updated the poster `<img>` to source `src`/`srcset`/`sizes` from the computed attributes (falling back to the raw `film.posterUrl` for `src`), and added intrinsic `width="64"` `height="96"` plus `loading="lazy"` and `decoding="async"`.
- The existing `w-16 h-24 object-cover flex-shrink-0` classes and `alt={film.title}` are unchanged.

## Impact
- Affects the `/letterboxd` import results grid, which can render dozens of matched-film posters after a watchlist import.
- The poster, previously the only one in the app with no loading hints, no longer downloads the full-resolution TMDB asset (w500/w780/original) to display at 64x96 CSS px. It now requests w92/w154 via responsive srcset, cutting per-poster image bytes ~10-30x across the grid.
- Metrics moved: image transfer bytes (down), CLS (intrinsic 64x96 reservation now matches the rendered box), and LCP on `/letterboxd` (smaller, lazily/asynchronously fetched posters).

## Behavior preservation
Rendered output is byte-identical: the 64x96 (`w-16 h-24`) box and `object-cover` crop are unchanged, the width/height attrs exactly match the existing CSS dimensions, and non-TMDB poster URLs fall back to the original `src` — verified by a before/after screenshot diff of `/letterboxd` (imported films) at 390px and 1280px, which is the acceptance test.
