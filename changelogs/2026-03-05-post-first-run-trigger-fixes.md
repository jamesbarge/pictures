# 2026-03-05: Post-First-Run Trigger.dev Fixes

**Branch**: `fix/curzon-api-domain-migration`
**Files**: `src/scrapers/base.ts`, `src/db/enrich-letterboxd.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`

## Context

First production run of `scrape-all-orchestrator` on Trigger.dev completed with issues:
- 6 tasks timed out (queue contention)
- 2 tasks completed with 0 results (Close-Up, Olympic — health check failures)
- Letterboxd enrichment: 78/82 films failed silently
- BFI programme changes: 403 Forbidden

## Changes

### Health check fix (`src/scrapers/base.ts`)
- Changed `HEAD` request to `GET` — many cinema sites reject HEAD
- Replaced bot User-Agent (`PicturesBot/1.0`) with real browser UA
- Added `redirect: "follow"` for sites that redirect

### Letterboxd enrichment logging (`src/db/enrich-letterboxd.ts`)
- `fetchLetterboxdRating()` now returns structured failure reasons instead of bare `null`
- Failure categories: `slug_404`, `year_mismatch`, `no_rating_meta`, `rating_parse_error`, `fetch_error`, `event_filtered`
- Summary prints a failure breakdown table at the end of each enrichment run

### BFI programme changes headers (`src/scrapers/bfi-pdf/programme-changes-parser.ts`)
- Added full browser request headers (`Sec-Fetch-*`, `Accept-Encoding`, `Cache-Control`, etc.)
- Updated Chrome version in User-Agent from 120 to 131
- Addresses 403 from BFI's WAF when requests come from cloud worker IPs

## Also on this branch (previous commits)
- Curzon API domain: `vwc.curzon.com` → `digital-api.curzon.com`
- Global `maxDuration`: 300s → 600s
