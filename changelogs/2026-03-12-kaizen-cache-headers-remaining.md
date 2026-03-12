# Kaizen — Replace remaining inline cache headers with shared constants

**PR**: #162
**Date**: 2026-03-12

## Changes
- `src/app/api/films/search/route.ts`: Replaced 2 inline Cache-Control strings with `CACHE_10MIN` and `CACHE_5MIN`
- `src/app/api/festivals/route.ts`: Replaced inline Cache-Control with `CACHE_5MIN`
- `src/app/api/festivals/[slug]/route.ts`: Replaced inline Cache-Control with `CACHE_2MIN`
- `src/app/api/search/route.ts`: Replaced inline Cache-Control with `CACHE_5MIN`

## Impact
- Code quality improvement, no behavior changes
- Completes the cache header constant migration started in PR #155
- All API routes now use shared constants from `src/lib/cache-headers.ts`
- Kaizen category: extract-constant
