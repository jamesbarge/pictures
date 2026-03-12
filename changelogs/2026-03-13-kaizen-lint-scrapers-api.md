# Kaizen — Remove unused imports/params in scrapers and API routes

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_request` and `_admin` params from bfi-import GET handler (last admin route with unused params)
- Remove unused `sql` import from `reverse-tagger.ts` (drizzle-orm)
- Remove unused `RawScreening` and `VenueConfig` type imports from `runner-factory.ts`
- Remove unused `sql` import from `season-linker.ts` (drizzle-orm)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
