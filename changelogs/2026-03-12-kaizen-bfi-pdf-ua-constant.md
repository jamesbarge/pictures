# Kaizen — Use CHROME_USER_AGENT_FULL in BFI PDF Scrapers

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Added `CHROME_USER_AGENT_FULL` import to `src/scrapers/bfi-pdf/fetcher.ts` (2 replacements)
- Added import and replaced UA in `src/scrapers/bfi-pdf/programme-changes-parser.ts` (1 replacement)
- Added import and replaced UA in `src/scrapers/bfi-pdf/cleanup.ts` (1 replacement)

## Impact
- Code quality improvement, no behavior changes
- Continues extract-constant arc from PR #192 (4 more occurrences eliminated)
- 4 additional occurrences remain: peckhamplex.ts, browser.ts, front-end-extractor.ts, booking-checker.ts
- Kaizen category: duplicate-pattern
