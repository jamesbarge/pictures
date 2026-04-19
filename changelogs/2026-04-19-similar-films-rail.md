# "If you like this" similar films rail

**PR**: TBD
**Date**: 2026-04-19

## Context

The V2a film-detail design includes an `If you like this` horizontal rail of similar films at the bottom of the page. It was stubbed out in PR #431 because the backend didn't expose similar films. This PR closes that follow-up end-to-end — backend route → DB helper → frontend loader → rail render.

## Changes

### Backend

**`src/lib/tmdb/client.ts`** — add `getSimilar(tmdbId)` method. Returns only `{ id }` because we re-read poster + title from our own DB; no need to trust TMDB's copy.

**`src/db/repositories/film.ts`** — add `findByTmdbIds(tmdbIds: number[])` helper. Returns id + tmdbId + title + year + posterUrl for each match.

**`src/app/api/films/[id]/similar/route.ts`** (new) — proxies TMDB's `/movie/{id}/similar`, intersects with films we carry, preserves TMDB's similarity ordering, returns up to 6. Caches 24 h at the edge (`Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`) — similarity doesn't change day-to-day.

**Graceful degradation**:
- Film has no `tmdbId` → empty `similar[]`, rail hides on frontend
- TMDB returns an empty list or 5xx → caught + empty `similar[]`, rail hides
- Fewer than 2 matches we carry → empty (a rail of 1 reads as a broken feature, not a recommendation)

### Frontend

**`frontend/src/routes/film/[id]/+page.ts`** — fetch `/api/films/${id}/similar` in parallel with the main detail request using `Promise.all`. The similar request has its own `.catch(() => ({ similar: [] }))` so a similar-endpoint failure never breaks the detail page.

**`frontend/src/routes/film/[id]/+page.svelte`** — render a new `<section class="similar">` below the body grid when `similar.length >= 2`. Desktop: responsive grid (auto-fill, minmax 132px). Mobile: horizontal scroll rail with scroll-snap, flex-basis 132px per card.

## Visual treatment

Matches the V2a system: Fraunces 28px italic-first-letter heading ("*I*f you like this"), 2/3 aspect posters in warm-bg-subtle frames, Fraunces 14px titles, Cormorant italic 12px year. No accent colour, no emphasis — it's a quiet bottom rail, not a CTA.

## Verification

- Backend route: requires `TMDB_API_KEY` in env (already set in `.env.local` and Vercel since other TMDB lookups use it).
- `svelte-check`: no new errors.
- `npx tsc --noEmit` (backend): clean on the new files.

## Follow-up

None — this closes the last remaining follow-up from PR #431.
