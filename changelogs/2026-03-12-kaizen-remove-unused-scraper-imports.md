# Kaizen — Remove Unused Imports in Scraper Files

**PR**: #145
**Date**: 2026-03-12

## Changes
- Removed unused import `addYears` from `phoenix.ts`
- Removed unused import `parse` from `romford-lumiere.ts`
- Removed unused import `BrowserContext` from `browser.ts`
- Removed unused imports `vi`, `beforeEach` from `date-parser.test.ts`
- Removed unused interface `FilmPerformance` from `cine-lumiere.ts`
- Removed unused interface `PhoenixFilm` from `phoenix.ts`
- Removed unused interface `CineSyncShowtime` from `romford-lumiere.ts`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
- Eliminates 7 of 15 lint warnings in scraper safe zones
