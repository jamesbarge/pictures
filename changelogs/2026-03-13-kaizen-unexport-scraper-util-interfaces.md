# Kaizen — Unexport 5 Internal-Only Scraper Util Interfaces

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed `export` from `FetchWithRetryOptions` in fetch-with-retry.ts (0 external consumers)
- Removed `export` from `ScreeningMetadata` and `DuplicateCheckResult` in screening-classification.ts (0 external consumers)
- Removed `export` from `CleanTitleResult` in film-title-cleaner.ts (0 external consumers)
- Removed `export` from `ScrapeDiffReport` in scrape-diff.ts (0 external consumers)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Reduces public API surface of scraper utils — these types are implementation details
