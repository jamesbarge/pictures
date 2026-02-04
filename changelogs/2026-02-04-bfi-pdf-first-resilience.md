# BFI PDF-First Resilience Path

**PR**: #73
**Date**: 2026-02-04

## Changes
- Updated `runCinemaScraper` in `src/inngest/functions.ts` to route `bfi-southbank` and `bfi-imax` runs through `runBFIImport()`.
- Added structured result semantics to the BFI importer in `src/scrapers/bfi-pdf/importer.ts`:
  - `status`: `success | degraded | failed`
  - per-source status for `pdf` and `programmeChanges`
  - `errorCodes` for stable operational classification
- Kept the existing `success` boolean, but now mark partial-source runs as degraded success to reduce false hard-failures.
- Added `bfi_import_runs` schema (`src/db/schema/bfi-import-runs.ts`) and SQL migration (`src/db/migrations/0006_add_bfi_import_runs.sql`) to persist each BFI import run.
- Added `GET /api/admin/bfi/status` endpoint in `src/app/api/admin/bfi/status/route.ts` for latest BFI run status + next scheduled run visibility.
- Added BFI degraded/failure Slack alerting from importer runs when status is not `success`.
- Fixed BFI dedup key collisions by including venue/screen in the merge key (`film + datetime + screen`) to avoid dropping simultaneous Southbank/IMAX screenings.
- Updated `src/app/api/admin/scrape/all/route.ts` to build events from the canonical registry instead of hardcoded lists.
- Added deduping logic in scrape-all:
  - one event per non-BFI chain scraper
  - one BFI event total (PDF import) for Southbank + IMAX
- Added tests in `src/scrapers/bfi-pdf/importer.test.ts` for degraded, failed, and success paths.
- Extended `src/app/api/admin/scrape/all/route.test.ts` with assertions for BFI and chain deduping.
- Added tests for BFI status endpoint in `src/app/api/admin/bfi/status/route.test.ts`.

## Impact
- BFI scraping is now cloud-runnable from Inngest trigger paths even when Playwright runtime is unavailable.
- Operational triage is easier: failures can be grouped by source and error code, and surfaced via Slack + status endpoint.
- Scrape-all behavior is more consistent with the canonical registry and less vulnerable to drift from stale hardcoded lists.
