# Kaizen — Move sourceId dedup into BaseScraper.validate()

**PR**: #151
**Date**: 2026-03-12

## Changes
- Added sourceId-based deduplication to `BaseScraper.validate()` in `src/scrapers/base.ts`
- Removed identical `validate()` overrides from 4 v2 scrapers: rich-mix-v2, electric-v2, riverside-v2, castle-v2
- Remaining v2 scrapers (lexi-v2, genesis-v2) have harmlessly redundant overrides — future cleanup
- nickel-v2 retains its override for MYSTERY MOVIE filtering

## Impact
- Code quality improvement, no behavior changes
- Eliminates ~40 lines of duplicated code across scraper files
- All scrapers now get sourceId dedup for free from the base class
- Kaizen category: duplicate-pattern
