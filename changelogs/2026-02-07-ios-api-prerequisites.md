# iOS API Prerequisites — Backend Endpoints

**Date**: 2026-02-07
**Type**: Feature
**Scope**: API layer, repository layer

## Summary

Added four new API endpoints and extended the screening response to provide the backend prerequisites needed for iOS app development.

## New Endpoints

### `GET /api/films/:id`
- Returns full film metadata (TMDB data, ratings, cast, etc.) plus upcoming screenings with cinema details
- Zod UUID validation on the `id` param
- Rate limited under `RATE_LIMITS.public` with prefix `"films"`
- 404 for unknown film IDs

### `GET /api/cinemas`
- Lists all active cinemas with address, coordinates, features, and programming focus
- Optional query filters: `chain` (exact match) and `features` (comma-separated, any-match)
- Longer cache: `s-maxage=600, stale-while-revalidate=1200` (cinema data rarely changes)
- ~40-50 results, no pagination needed

### `GET /api/cinemas/:id`
- Cinema detail with description plus up to 100 upcoming screenings
- Each screening includes film metadata (title, year, poster, runtime, directors, ratings, contentType)
- 404 for unknown cinema IDs

### Cursor Pagination on `GET /api/screenings`
- New optional query params: `cursor` (opaque string) and `limit` (1-500, default 200)
- Cursor format: `{ISO datetime}_{screening UUID}` for deterministic `(datetime, id)` ordering
- Response meta includes `cursor`, `hasMore`, and `limit` when pagination is active
- Fully backward compatible — existing clients without cursor/limit get the same behavior as before

## Extended Screening Fields

Added to `screeningWithDetailsSelect` and `ScreeningWithDetails` type:
- `hasSubtitles` (boolean)
- `hasAudioDescription` (boolean)
- `isRelaxedScreening` (boolean)
- `film.contentType` (string: "film" | "concert" | "live_broadcast" | "event")
- `film.tmdbRating` (number | null)

These are additive, non-breaking changes. The web frontend doesn't destructure the response, so existing behavior is unaffected.

## New Files
- `src/db/repositories/film.ts` — `getFilmById()`, `getUpcomingScreeningsForFilm()`
- `src/db/repositories/cinema.ts` — `getActiveCinemas()`, `getCinemaById()`, `getUpcomingScreeningsForCinema()`
- `src/app/api/films/[id]/route.ts`
- `src/app/api/cinemas/route.ts`
- `src/app/api/cinemas/[id]/route.ts`

## Modified Files
- `src/db/repositories/screening.ts` — extended select, added `getScreeningsWithCursor()`, `parseCursor()`, `buildCursor()`
- `src/db/repositories/index.ts` — re-exports new repositories
- `src/app/api/screenings/route.ts` — added `cursor`/`limit` query params

## Patterns Followed
- Zod `.safeParse()` for input validation
- `checkRateLimit(getClientIP(request), { ...RATE_LIMITS.public, prefix: "..." })`
- `handleApiError(error, "GET /api/...")` catch wrapper
- `NotFoundError` for missing resources (404)
- Cache headers: `"public, s-maxage=300, stale-while-revalidate=600"`
- `.toISOString()` for Date values in `sql` template literals (Drizzle gotcha)
