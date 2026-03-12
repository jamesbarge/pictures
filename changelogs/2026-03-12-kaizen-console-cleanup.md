# Kaizen — Promote failure console.log to console.warn in scrapers

**PR**: #150
**Date**: 2026-03-12

## Changes
- Promoted `console.log` to `console.warn` for 7 error/failure log messages across 5 scraper files
- Fixed `catch (e)` → `catch (error)` in close-up.ts (missed in previous error-handling pass)

## Files Modified
- `src/scrapers/cinemas/close-up.ts` — parse failure + missing shows variable warnings
- `src/scrapers/cinemas/rich-mix-v2.ts` — datetime parse failure warning
- `src/scrapers/cinemas/rich-mix.ts` — datetime parse failure warning
- `src/scrapers/cinemas/rio.ts` — JSON extraction failure warning
- `src/scrapers/utils/fetch-with-retry.ts` — server error + fetch failure retry warnings

## Impact
- Code quality improvement, no behavior changes
- Makes failure conditions searchable by log severity level
- Kaizen category: console-cleanup
