# Kaizen — Standardize error handling in user API routes

**PR**: #156
**Date**: 2026-03-12

## Changes
- Migrated 7 catch blocks across 4 user API routes from manual error handling to the shared `handleApiError` utility
- Removed unused `unauthorizedResponse` imports (the Unauthorized check is built into `handleApiError`)
- Each catch block simplified from 4-5 lines to 1 line

## Files Modified
- `src/app/api/user/route.ts` — 1 catch block migrated (GET)
- `src/app/api/user/preferences/route.ts` — 2 catch blocks migrated (GET, PUT)
- `src/app/api/user/film-statuses/route.ts` — 2 catch blocks migrated (GET, POST)
- `src/app/api/user/film-statuses/[filmId]/route.ts` — 2 catch blocks migrated (PUT, DELETE)

## Impact
- Code quality improvement, no behavior changes
- Consistent error handling across user API routes
- Kaizen category: error-handling
