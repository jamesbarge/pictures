# Search — read-only catalog endpoint

**PR**: TBD
**Date**: 2026-06-03

## Why
To make film search **lightning-fast and typo-tolerant**, the frontend will build an in-browser fuzzy
index (MiniSearch) and search it client-side — 0ms per keystroke, no server round-trip. That needs a
single lean endpoint that returns the whole searchable catalog at once. This PR ships that endpoint; the
frontend instant-search lands in a follow-up.

## Changes
- `src/app/api/search/catalog/route.ts` (new) — `GET /api/search/catalog`, read-only. Returns:
  ```
  { films:  [{id, title, year, directors, posterUrl}],   // films with a FUTURE screening
    cinemas:[{id, name, shortName, area}],                // active cinemas
    people: [{name, role:"director", filmCount}],         // directors of those films
    generatedAt }                                         // ISO, for client staleness
  ```
  - Films: `selectDistinct` over films ⨝ screenings where `datetime >= now()` (mirrors the live search's
    future-screening filter, so every result is actionable). Cinemas: `getActiveCinemas()` (same repo as
    `/api/cinemas`), `area` from the address jsonb. People: the `/api/directors` `unnest` pattern with no
    day cap. All three run in `Promise.all`.
  - Rate-limited (`RATE_LIMITS.public`, prefix `search-catalog`) like `/api/cinemas`/`/api/directors`.
- `src/lib/cache-headers.ts` — new `CACHE_1HOUR` (`s-maxage=3600, stale-while-revalidate=86400`). The
  catalog only changes when scrapes add/remove screenings, so it's cached hard at the edge.

## Verification
- `tsc --noEmit` — clean (no errors in the new files).
- Queries verified vs prod DB: **1090 films / 65 cinemas / 717 directors**.

## Impact
- Backend-only, additive (new route). No change to existing endpoints. Goes live on the next
  `api.pictures.london` promote; the frontend instant search degrades gracefully (falls back to the
  existing server search) until it's live.
