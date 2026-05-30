# Route FilmSimilarRail posters through getPosterImageAttributes + add width/height

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- `FilmSimilarRail.svelte` now imports `getPosterImageAttributes` from `$lib/utils`.
- Inside `{#if s.posterUrl}`, an `{@const poster = ...}` computes responsive TMDB poster attributes (`baseSize: w185`, `srcSetSizes: w92/w154/w185`, `sizes: 132px`).
- The poster `<img>` now sets `src`/`srcset`/`sizes` from those attributes (with `src` falling back to the raw `s.posterUrl` for non-TMDB URLs) and adds explicit `width="132"` / `height="198"`.
- `alt`, `loading="lazy"`, and `decoding="async"` are unchanged.

## Impact
- Affects the "If you like this" similar-films rail on `/film/[id]` pages.
- Perf metric moved: image bytes transferred. Rail cards render at 132px wide (grid `minmax(132px, 1fr)` / mobile `flex 0 0 132px`), so the browser now picks a w92/w154/w185 source via `srcset`/`sizes` instead of downloading the full-resolution (commonly w500+) poster. Below-the-fold component that can show many films, so the byte savings compound.
- The explicit `width`/`height` (132×198, the natural 2:3 box) improves CLS robustness by giving the lazy-loaded image an intrinsic aspect ratio.

## Behavior preservation
Rendered output is identical: 132px 2/3 posters with the same crop (`object-fit: cover` from `.similar-poster img` still drives layout sizing; the 132×198 attributes match the rendered box exactly). Acceptance test: open a `/film/[id]` page with >=2 similar films, scroll the rail into view at 390px and 1280px before/after — screenshot-diff is byte-identical; network panel shows rail posters now requesting w92/w154/w185 instead of the full source.
