# Kaizen — Use CHROME_USER_AGENT_FULL in Remaining Scrapers

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Replaced hardcoded Chrome UA in `src/scrapers/cinemas/peckhamplex.ts` (fetch header)
- Replaced hardcoded Chrome UA in `src/scrapers/utils/browser.ts` (Playwright context)
- Replaced hardcoded Chrome UA in `src/trigger/qa/utils/front-end-extractor.ts` (Playwright context)
- Replaced hardcoded Chrome UA in `src/trigger/qa/utils/booking-checker.ts` (Playwright context)

## Impact
- Code quality improvement, no behavior changes
- Completes the extract-constant arc started in PR #192 and continued in PR #193
- Only 1 occurrence remains: `src/agents/fallback-enrichment/booking-page-scraper.ts` (Chrome/131 variant)
- Kaizen category: duplicate-pattern
