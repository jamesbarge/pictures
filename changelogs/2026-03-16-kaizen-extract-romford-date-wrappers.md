# Kaizen — Extract Date Wrapper Parsing in Romford Scraper

**PR**: #375
**Date**: 2026-03-16

## Changes
- Extracted `extractFromDateWrappers()` from `extractScreeningsDirectly()` in `src/scrapers/cinemas/romford-lumiere.ts`
- Moves 4-level deep cheerio callback nesting into a named method with clear intent
- Net change: +53/-47

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
