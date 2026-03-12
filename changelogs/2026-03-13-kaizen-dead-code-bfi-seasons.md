# Kaizen — Remove dead code from BFI scraper and seasons base

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove 3 unused private methods from BFI scraper: `generateDateRange`, `formatDate`, `buildSearchUrl` (legacy search approach, superseded by calendar navigation)
- Remove unused `RawSeasonFilm` type import from `seasons/base.ts`

## Impact
- Code quality improvement, no behavior changes
- ~30 lines of dead code removed
- Kaizen category: dead-code
