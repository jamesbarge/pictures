# Kaizen — Remove Dead extractFilmsFromPage from Romford-Lumiere

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed unused `extractFilmsFromPage()` private method (~106 lines) from romford-lumiere scraper
- Method was never called — scraper uses `extractScreeningsDirectly()` instead
- Second dead method `extractFilmScreenings()` (~142 lines) remains for next cycle

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
