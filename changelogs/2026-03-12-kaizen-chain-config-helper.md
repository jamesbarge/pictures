# Kaizen — Extract shared buildChainConfig helper

**PR**: #158
**Date**: 2026-03-12

## Changes
- Extracted duplicated `buildConfig()` function from 3 chain scraper trigger files into a shared `buildChainConfig` helper in `venue-from-registry.ts`
- The helper reuses the existing `cinemaToVenue` mapping function, eliminating redundant venue-to-definition transforms
- Each chain file reduced from 33 lines to 17 lines

## Files Modified
- `src/trigger/utils/venue-from-registry.ts` — added `buildChainConfig(chainKey, chainName, createScraper)` helper
- `src/trigger/scrapers/chains/curzon.ts` — replaced local `buildConfig()` with shared helper
- `src/trigger/scrapers/chains/picturehouse.ts` — replaced local `buildConfig()` with shared helper
- `src/trigger/scrapers/chains/everyman.ts` — replaced local `buildConfig()` with shared helper

## Impact
- Code quality improvement, no behavior changes
- Odeon left unchanged (uses custom venue registry with different address structure)
- Kaizen category: duplicate-pattern
