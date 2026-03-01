# Fix Homepage Screening Counts

**PR**: #129
**Branch**: `fix/homepage-screening-counts`
**Date**: 2026-03-01

## Problem

Film cards on the homepage displayed incorrect screening counts. For example, "Woman in the Dunes" showed 1 showing on the homepage but 5 on the detail page.

**Root cause**: The homepage loads only 3 days of screenings for fast initial render (`page.tsx:22`). The `filmTotals` memo in `calendar-view.tsx` counted from `parsedScreenings` — whatever was loaded so far. The detail page queries all future screenings with no upper date bound, so counts diverged.

## Solution

Added a lightweight server-side aggregation query that counts across all future screenings (matching the detail page's scope), then passed those authoritative totals down to the client.

### `src/app/page.tsx`

- New `getCachedFilmTotals` query: `GROUP BY filmId` with `count(screenings.id)` + `countDistinct(screenings.cinemaId)`
- Same WHERE clause as homepage screenings (future dates, film content type only) but **no upper date bound**
- Returns ~40 rows (one per film with upcoming screenings) — negligible cost
- 60s cache with `["screenings"]` revalidation tag
- Added to existing `Promise.all` (parallel with other queries)

### `src/components/calendar/calendar-view-loader.tsx`

- New `FilmTotal` interface and optional `filmTotals` prop
- Passes `undefined` when festival/season filter is active (server totals are global; filters need scoped counts)
- Otherwise forwards to `CalendarView` as `serverFilmTotals`

### `src/components/calendar/calendar-view.tsx`

- `filmTotals` memo branches: uses `serverFilmTotals` when present, falls back to client-side computation
- Added explicit `cinemaCount` field to totals map (previously derived from `cinemas.size` which only reflects loaded screenings)
- Server totals enriched with cinema display details from loaded screenings (for `singleCinema` name display)
- `singleCinema` lookup: tries server-enriched cinemas first, falls back to day's local screenings

## Key design decision

Server totals are **not** passed when a festival or season filter is active. In filtered views, the old client-side computation runs against filter-scoped screenings, so counts reflect the filtered context (e.g. "3 BFI LFF screenings" not "15 total screenings").
