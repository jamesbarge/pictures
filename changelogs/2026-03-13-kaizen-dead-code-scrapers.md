# Kaizen — Remove Dead Code in Scrapers (4 Files)

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- `electric-v2.ts`: Removed unused `venueIdToApiId` reverse mapping property (never referenced)
- `genesis-v2.ts`: Removed unused `$: CheerioAPI` parameter from `findDateContext()` and its call site
- `prince-charles.ts`: Removed unused `$: CheerioAPI` parameter from `parseShowtimeLi()` and its call site
- `veezi-scraper.ts`: Removed unused `delayMs` constructor parameter and property (never read after assignment)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
