# Kaizen — Use Shared UA Constants in Remaining Files

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Replaced hardcoded Chrome UA string with `CHROME_USER_AGENT` in `src/db/enrich-letterboxd.ts` and `src/scrapers/debug-genesis-structure.ts`
- Replaced hardcoded bot UA string with `BOT_USER_AGENT` in `src/scrapers/seasons/base.ts`

## Impact
- Code quality improvement, no behavior changes
- Nearly completes the UA string consolidation arc (only booking-page-scraper.ts remains)
- Kaizen category: extract-constant
