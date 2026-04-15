# TMDB Responsive Poster Images

**PR**: #423
**Date**: 2026-04-15

## Changes
- Added `getPosterImageAttributes()` utility to `frontend/src/lib/utils.ts` — extracts TMDB poster path from any URL and generates responsive `src`, `srcset`, and `sizes` attributes using TMDB's width tiers (w92, w154, w185, w342, w500, w780)
- Added `preconnect` and `dns-prefetch` hints for `image.tmdb.org` in `app.html` to eliminate DNS/TLS latency on first image request
- Added module-level image cache in `FittedTitleCanvas.svelte` — Promise-based deduplication prevents redundant poster loads during canvas rendering, with proper cleanup on error
- Updated all 8 poster-consuming components to use responsive images: `FilmCard`, `SearchInput`, `ReachableResults`, film detail page, search, watchlist, tonight, this-weekend
- Film detail page uses `w342/w500/w780` srcset for high-quality poster display
- Calendar film cards use `w185/w342/w500` with responsive sizes matching grid breakpoints
- Watchlist thumbnails use `w92/w154` — a 36px thumbnail no longer downloads a 500KB original
- Added `decoding="async"` to poster images on detail and watchlist pages
- Festivals page server load now filters to only needed fields, reducing initial payload

## Impact
- Significant bandwidth savings on mobile — watchlist page alone drops from ~15MB to ~100KB of poster data for a 30-film list
- Faster LCP on film detail pages via preconnect + appropriately sized poster
- Canvas poster rendering no longer triggers duplicate network requests when hovering multiple cards with the same film
