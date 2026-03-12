# Kaizen — Extract shared slugify to scraper utils

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Extracted identical `slugify(title)` method from `garden.ts` and `romford-lumiere.ts` into shared `src/scrapers/utils/url.ts`
- Both scrapers now import the shared function instead of maintaining private copies
- No behavior changes — the function implementation is byte-for-byte identical

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: duplicate-pattern
- Reduces duplication for any future scrapers needing sourceId slugification
