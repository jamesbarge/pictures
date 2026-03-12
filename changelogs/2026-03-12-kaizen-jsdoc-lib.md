# Kaizen — Add JSDoc to undocumented exports in lib

**PR**: #174
**Date**: 2026-03-12

## Changes
- `src/lib/posters/service.ts`: Added JSDoc to `PosterService` class and `getPosterService()` factory
- `src/lib/travel-time.ts`: Added JSDoc to `groupByUrgency()` function
- `src/lib/letterboxd-import.ts`: Added JSDoc to `LetterboxdImportError` class

## Impact
- Code quality improvement, no behavior changes
- All exported functions/classes in src/lib/ now have JSDoc documentation
- Kaizen category: jsdoc
