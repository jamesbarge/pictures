# Letterboxd Watchlist Import

**Date**: 2026-03-05
**Branch**: `feature/letterboxd-import`

## Summary

New feature allowing users to enter a Letterboxd username and see which of their watchlist films are currently screening across London cinemas. Works without sign-in for preview; auth required to save to watchlist.

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/letterboxd-import.ts` | Core scraper, matching, enrichment, and caching library |
| `src/lib/letterboxd-import.test.ts` | 44 unit tests with HTML fixtures and DB mocks |
| `src/app/api/letterboxd/preview/route.ts` | Unauthenticated preview API (POST) |
| `src/app/api/user/import-letterboxd/route.ts` | Authenticated import API (POST) with batch upsert |
| `src/trigger/enrichment/letterboxd-import.ts` | Trigger.dev task for TMDB lookup of unmatched entries |
| `src/components/watchlist/letterboxd-import.tsx` | Main import UI component with 4-state machine |
| `src/components/watchlist/letterboxd-import-trigger.tsx` | Toggle button for sort bar |
| `src/app/letterboxd/page.tsx` | Landing page at /letterboxd |

## Files Modified

| File | Change |
|------|--------|
| `src/components/watchlist/watchlist-view.tsx` | Added import trigger to sort bar, import panel, enhanced EmptyWatchlist with import CTA |

## Technical Details

### Scraper
- Cheerio-based parsing of public Letterboxd watchlist pages
- Pagination via `.paginate-nextprev a.next` links
- 1-second rate limiting between page fetches
- 500-entry cap (~18 pages max)
- Structured error handling: user_not_found, private_watchlist, empty_watchlist, rate_limited, network_error

### Matching
- Loads all films (contentType=film) into normalized title map
- Year ±1 tolerance matching with exact-year preference
- Batch screening query with cinema join for enrichment
- "Last chance" flag when count <= 2

### Caching
- In-memory Map with 1-hour TTL
- Max 50 entries with LRU-style eviction
- Cache key: lowercased username

### Background Task
- Trigger.dev `task()` (on-demand, not scheduled)
- TMDB matching with 250ms rate limiting
- Creates new film records with full metadata from TMDB
- Upserts into userFilmStatuses as "want_to_see"

### Analytics (PostHog)
- letterboxd_import_started
- letterboxd_import_results_viewed
- letterboxd_import_signup_prompted
- letterboxd_import_saved
- letterboxd_import_film_clicked
