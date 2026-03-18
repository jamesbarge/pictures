# Fix Curzon, Electric White City, and Time-Shift Orphan Screenings

**PR**: #398
**Date**: 2026-03-18

## Changes

### Curzon Chain — SSR Token Extraction
- Root cause: `waitUntil: "networkidle"` never fires on Curzon's React SPA (analytics scripts keep loading indefinitely), causing the `goto()` call to timeout. In production Docker environments (Trigger.dev), this prevented auth token capture.
- Fix: Extract JWT from `window.initialData.api.authToken` (server-side rendered into the page HTML). Only needs `domcontentloaded`, not full SPA initialization.
- Kept request interception as fallback in case Curzon changes their SSR approach.
- Added API URL change detection (logs warning if API domain moves again).
- Updated SCRAPING_PLAYBOOK.md with Curzon-specific documentation.

### Electric Cinema White City — Venue Configuration
- Root cause: White City venue was never wired up for production scraping despite the API being healthy (99 screenings available).
- Fix: Added `electric-white-city` to cinema registry, task registry, and known IDs. Switched trigger task from `SingleVenueConfig` to `MultiVenueConfig` supporting both Portobello and White City venues. Updated from v1 Playwright scraper to v2 API-based scraper.

### Pipeline — Time-Shift Orphan Cleanup
- Root cause: When a cinema updates a showtime between scraper runs (e.g., 17:15 -> 18:15), the pipeline creates a new screening but never removes the old one. These "ghost" screenings accumulate, showing 2-3 times per film per day.
- Fix: Added `cleanupSupersededScreenings()` to `pipeline.ts` — runs after each successful scrape, deletes orphan screenings that have a fresher sibling (same film, same date, within 3h) from the current run.
- Safety: only deletes future screenings, only when a current sibling exists, 3h window preserves legitimate matinee+evening pairs (4h+ apart).
- Also rewrote `scripts/cleanup-pcc-duplicate-screenings.ts` with safe pairwise SQL comparison (executed: 10 orphans deleted across ArtHouse Crouch End, Olympic Studios, Rich Mix).

## Impact
- **Curzon**: 3 venues (Soho, Mayfair, Bloomsbury) recovering from 3+ weeks of stale data
- **Electric White City**: New venue now receiving screenings (99 available)
- **All cinemas**: Time-shift orphans will be automatically cleaned up on each scrape run going forward
