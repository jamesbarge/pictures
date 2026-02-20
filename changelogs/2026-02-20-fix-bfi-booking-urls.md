# Fix BFI Booking Links (Broken Search API)

**Date**: 2026-02-20
**PR**: #118
**Type**: Bug fix
**Impact**: All BFI Southbank and IMAX booking links

## Problem

BFI changed their What's On search API. The old `article_search_text` parameter
was removed, causing all booking links on pictures.london to land on either:
- An error alert: "An invalid parameter article_search_text was passed to action TScontentBO"
- A 500 error page

Additionally, the programme-changes parser always generated Southbank URLs,
even for IMAX screenings.

## Solution

Created a shared `buildBFISearchUrl()` utility that constructs URLs using the
new API format:

- **Old**: `?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_text={title}`
- **New**: `?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_id={GUID}&BOset::WScontent::SearchCriteria::search_criteria={title}`

Each venue has a unique GUID:
- **Southbank**: `25E7EA2E-291F-44F9-8EBC-E560154FDAEB`
- **IMAX**: `49C49C83-6BA0-420C-A784-9B485E36E2E0`

## Files Changed

| File | Change |
|------|--------|
| `src/scrapers/bfi-pdf/url-builder.ts` | New shared URL builder with venue config |
| `src/scrapers/bfi-pdf/url-builder.test.ts` | 15 unit tests |
| `src/scrapers/bfi-pdf/pdf-parser.ts` | Use `buildBFISearchUrl()` with venue routing |
| `src/scrapers/bfi-pdf/programme-changes-parser.ts` | Use `buildBFISearchUrl()` with cinemaId routing |
| `scripts/fix-bfi-booking-urls.ts` | One-time DB migration for existing broken URLs |

## Migration

Run the migration script to fix existing screenings in the database:

```bash
npx tsx scripts/fix-bfi-booking-urls.ts          # dry run (preview)
npx tsx scripts/fix-bfi-booking-urls.ts --apply   # apply changes
```
