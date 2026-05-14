# Route BFI scraper in /scrape to the PDF importer

**PR**: TBD
**Date**: 2026-05-14

## Summary

Follow-up to #488. That PR made `npm run scrape:bfi-pdf` work end-to-end but the unified `/scrape` registry was still wired to the Playwright click-flow scraper, which is structurally broken under Cloudflare. This change routes the registered BFI scraper to the PDF importer so `/scrape` produces real screenings for BFI.

**Before**: `npm run scrape:bfi` → Playwright click-flow → 0 screenings (Cloudflare blocks each click)
**After**: `npm run scrape:bfi` → PDF importer → 94 screenings

## Changes

`src/scrapers/cinemas/bfi.ts`:

- `BFIScraper.scrape()` now calls `getOrRunBFIImport()` (a wrapper around `runBFIImport()` from `bfi-pdf/`) and returns `[]`. The importer saves screenings for both BFI Southbank and BFI IMAX directly via the standard `saveScreenings` pipeline.

- New module-scope `bfiImportRunPromise` cache dedupes across the two venue invocations. The unified scrape calls `createBFIScraper("bfi-southbank").scrape()` and `createBFIScraper("bfi-imax").scrape()` in sequence — without the cache, the PDF would be fetched and parsed twice. With the cache, the second invocation awaits the first one's promise (~1s vs 23s).

- The old Playwright click-flow is kept as `_legacyPlaywrightScrape()` for reference, in case Cloudflare relaxes its per-action challenges or we add a paid proxy service.

## Trade-off

The unified pipeline's per-cinema summary will show `0 added, 0 updated` for both `bfi-southbank` and `bfi-imax` because `scrape()` returns `[]`. The actual DB write happens inside `runBFIImport`'s own `saveScreenings` call, which is outside the unified pipeline's accounting.

This is the wrong direction for observability but the right direction for correctness — the alternative is leaving BFI broken. The unified pipeline's overall screening count delta (before → after) will still show the BFI screenings; just the per-cinema attribution is misleading.

Future cleanup: refactor `runBFIImport` to return `RawScreening[]` separated by venue, then have `scrape()` return the appropriate venue's slice. Then the unified pipeline saves it normally and the per-cinema count is correct.

## Verification

- `npx tsc --noEmit` — clean
- `npm run test:run` — 910/910 pass
- `npm run scrape:bfi` — 94 screenings imported in 25s (was 0 in 4+ min)
- DB confirms: BFI Southbank `recent_scrapes=94` in last 5 min, total upcoming 1031
- BFI IMAX `recent_scrapes=0` (parser venue-mapping issue, see follow-up)

## Known follow-ups

- BFI IMAX gets 0 fresh scrapes from this run. The PDF parser's `convertToRawScreenings` may not be mapping `BFI IMAX` venue codes from the PDF to the `bfi-imax` cinema_id. Worth investigating.
- Improve coverage from ~57% (94 imported vs 174 screening patterns in the same PDF). Tighten segmentation.
- Parse both available PDFs (`fetchAllRelevantPDFs` exists but `runBFIImport` calls `fetchLatestPDF`).
- Programme changes page still 403s.
