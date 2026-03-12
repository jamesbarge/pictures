# Kaizen — Extract CHROME_USER_AGENT_FULL Constant

**PR**: #186
**Date**: 2026-03-12

## Changes
- Added `CHROME_USER_AGENT_FULL` constant to `src/scrapers/constants.ts`
- Replaced hardcoded full Chrome UA string in `src/scrapers/base.ts` (2 occurrences)
- Replaced in `src/scrapers/seasons/base.ts` (1 occurrence)
- Replaced in `src/scrapers/utils/veezi-scraper.ts` (1 occurrence)

## Impact
- Code quality improvement, no behavior changes
- 8+ additional occurrences remain in bfi-pdf/, browser.ts, peckhamplex, booking-checker, front-end-extractor for future cycles
- Kaizen category: extract-constant
