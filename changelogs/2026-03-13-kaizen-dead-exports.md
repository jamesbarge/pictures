# Kaizen — Remove 5 Dead Exports

**PR**: #256
**Date**: 2026-03-13

## Changes
- Removed `getPolygonCenter` and `getPolygonAreaKm2` from `src/lib/geo-utils.ts` — never imported
- Removed `aliasServerUser` from `src/lib/posthog-server.ts` — never imported
- Removed `CheerioElement` type from `src/scrapers/utils/cheerio-types.ts` — never imported
- Removed `resetFilmCache` from `src/scrapers/utils/film-matching.ts` — never imported

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
