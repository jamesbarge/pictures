# Deactivate Stale Cinema Venues

**PR**: TBD
**Date**: 2026-03-23

## Changes
- Deactivated 3 Curzon venues in scraper config (`src/scrapers/chains/curzon.ts`):
  - Curzon Camden (CAM1) — `active: false`
  - Curzon Wimbledon (WIM01) — `active: false`
  - Curzon Richmond (RIC1) — `active: false`
- All 3 venues had `last_scraped_at` of Feb 22, 2026 — the Curzon chain scraper runs successfully but these venues return 0 listings from the Vista OCAPI, indicating they've been closed/removed by Curzon
- Synced DB `is_active = false` for all 4 venues (including Everyman Walthamstow, which was already inactive in scraper config but not in DB)
- Deleted 3 stale future screenings from curzon-richmond
- Investigated The Nickel (null `last_scraped_at` in earlier check) — confirmed healthy: last scraped 2026-03-23T03:54 UTC with 93 future screenings

## Impact
- Reduces "stale cinema" alerts from 5 to 0 (The Nickel was healthy, 4 venues now properly inactive)
- No user-facing impact — these venues had 0 or near-0 screenings already
- Scraper orchestrator will skip these venues on future runs, saving API calls
