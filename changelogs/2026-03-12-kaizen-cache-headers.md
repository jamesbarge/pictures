# Kaizen — Extract shared Cache-Control header constants

**PR**: #155
**Date**: 2026-03-12

## Changes
- Created `src/lib/cache-headers.ts` with 3 named cache tier constants: `CACHE_2MIN`, `CACHE_5MIN`, `CACHE_10MIN`
- Replaced local `CACHE_HEADERS` definitions in 4 API route files with imports from the shared module

## Files Modified
- `src/lib/cache-headers.ts` — new shared constants file with `as const` typed cache header objects
- `src/app/api/screenings/route.ts` — import `CACHE_5MIN`, remove local definition
- `src/app/api/cinemas/[id]/route.ts` — import `CACHE_5MIN`, remove local definition
- `src/app/api/films/[id]/route.ts` — import `CACHE_5MIN`, remove local definition
- `src/app/api/cinemas/route.ts` — import `CACHE_10MIN`, remove local definition

## Impact
- Code quality improvement, no behavior changes
- Centralizes cache policy — future changes need only update one file
- Kaizen category: extract-constant
