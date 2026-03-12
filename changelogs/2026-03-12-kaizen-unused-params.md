# Kaizen — Prefix unused request params, remove unused index

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Prefix unused `request` parameter with `_` in DELETE handler of `/api/festivals/[slug]/follow`
- Prefix unused `request` parameter with `_` in DELETE and GET handlers of `/api/user/festivals/follows/[festivalId]`
- Prefix unused `request` parameter with `_` in DELETE handler of `/api/user/film-statuses/[filmId]`
- Remove unused `index` parameter from `.map()` callback in `festival-list.tsx`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Eliminates 5 TypeScript `noUnusedParameters` warnings
