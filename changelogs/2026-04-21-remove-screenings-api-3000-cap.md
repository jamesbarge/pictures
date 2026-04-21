# Remove 3000-screening cap from /api/screenings legacy path

**Date**: 2026-04-21

## Changes
- `src/db/repositories/screening.ts` — Removed `limit = 3000` default and `.limit(limit)` calls from `getScreenings`, `getScreeningsByFestival`, and `getScreeningsBySeason`.
- `src/db/repositories/screening.test.ts` — Updated mock to be thenable at any step of the query chain (terminal `.limit()` no longer called).

## Why
The home page (`/`) fetches 30 days of screenings via the non-paginated API path. With ~60 London cinemas scraping 4–8 weeks ahead, the legacy 3000-row cap truncated the response to roughly the first 8 days, hiding everything beyond. Concrete symptom: North by Northwest at Prince Charles Cinema (May 1–12, 2026) was in the DB with full enrichment but never appeared on the home page.

## Impact
- Home page and any other consumer of the non-paginated `/api/screenings` endpoint will now return all screenings in the requested date window.
- Payload size grows proportionally; consumers that need paging should use the existing cursor path (`?limit=200&cursor=...`).
- Festival and season queries are naturally bounded by slug filter, so removing their caps is safe.
