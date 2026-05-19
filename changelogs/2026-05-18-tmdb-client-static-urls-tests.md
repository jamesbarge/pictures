# Add unit tests for TMDBClient static URL builders

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/tmdb/client-static-urls.test.ts` (new) — 11 cases for `TMDBClient.getPosterUrl`, `getBackdropUrl`, `getProfileUrl`.

## Why
These three static methods are the canonical URL constructors for every TMDB-sourced image in the app (posters on cards, backdrops on film detail pages, director avatars on the /directors page). A regression in URL format produces 404s across the visual surface.

## Coverage
- Null-input → null for all three
- Default sizes: w342 (poster), w780 (backdrop), w185 (profile)
- Explicit size overrides incl. 'original'
- **Pinned slash handling**: `${size}${posterPath}` — caller's leading `/` preserved (no double slash)
- Profile-specific `h632` height-anchored size (unusual; pinned)

## Changelog deferral note
Per #523-#530.
