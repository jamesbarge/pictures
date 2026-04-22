# Restore calendar ordering by Letterboxd rating then TMDB popularity

**PR**: TBD
**Date**: 2026-04-22

## Changes
- Add nullable `tmdb_popularity` / `tmdbPopularity` to the film schema, shared types, repository selects, and the `/api/screenings` response so the live Svelte calendar pages can sort on a real popularity signal.
- Extend TMDB movie-detail typing with `popularity` and persist it anywhere the code already writes `tmdbRating`, including enrichment, matching, cleanup, poster-audit, and Letterboxd-import paths.
- Add `npm run db:backfill-tmdb-popularity`, a targeted backfill that fetches TMDB details for films with `tmdbId` present and `tmdbPopularity` missing.
- Replace the duplicated route-local comparators on `/`, `/tonight`, and `/this-weekend` with a shared frontend helper that orders films by:
  rated before unrated,
  `letterboxdRating` descending,
  `tmdbPopularity` descending,
  earliest upcoming screening ascending.
- Add a repo-local `src/lib/calendar-sort.ts` module so the root Vitest suite can cover the ordering logic without importing SvelteKit code from `frontend/`, which was failing on Linux CI under `vite:oxc`.
- Add regression coverage for the shared comparator, the screening repository select, and the screenings API response shape.

## Impact
- The Svelte calendar pages now follow the intended ordering rule instead of falling back to screening time immediately after Letterboxd rating.
- Existing matched films can be backfilled without a full re-enrichment pass.
- The legacy React/Next calendar path under `src/app/` is unchanged.
