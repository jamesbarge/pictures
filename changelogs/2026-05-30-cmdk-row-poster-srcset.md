# add srcset/sizes to command-palette FilmRow + UserStatusRow posters

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- `FilmRow.svelte`: poster `<img>` now derives responsive image attributes via the existing `getPosterImageAttributes` util (`baseSize: 'w92'`, `srcSetSizes: ['w92','w154']`, `sizes: '36px'`) and emits `srcset` + `sizes`. `src` falls back to the raw `film.posterUrl` for non-TMDB hosts.
- `UserStatusRow.svelte`: same treatment, with `sizes: '32px'` to match its 32px poster box, falling back to the raw `status.filmPosterUrl`.
- Existing `width`/`height`/`loading`/`decoding`/`alt`/`class` attributes left untouched on both rows.

## Impact
- Affects the cmd+k command palette result list (`FilmRow`, `UserStatusRow`).
- Perf metric moved: poster payload on palette queries. Browsers now fetch the w92 (or w154 on hi-DPI) TMDB variant for a ~36px/32px box instead of the persisted w500 image. ~90% poster byte reduction (~300-450KB -> ~30-40KB for an 8-result query), improving open-to-image latency on mobile/3G.

## Behavior preservation
Rendered DOM box, layout, and computed styles are identical (same width/height, same CSS class, same fallback `src` for non-TMDB hosts); only the fetched image variant changes. Acceptance: Playwright opens cmd+k, types a query, asserts the row `<img>` carries `srcset` (w92 + w154) and `sizes`, renders at the identical CSS box with no layout shift, and non-TMDB posters still resolve to the raw `src`.
