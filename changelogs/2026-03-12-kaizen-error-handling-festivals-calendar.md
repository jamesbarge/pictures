# Kaizen — Standardize error handling in festival follows and calendar routes

**PR**: #163
**Date**: 2026-03-12

## Changes
- `src/app/api/user/festivals/follows/[festivalId]/route.ts`: Replaced 2 manual catch blocks (PUT, DELETE) with `handleApiError`. Removed unused `unauthorizedResponse` import. Left GET's graceful fallback (`{ following: false }`) unchanged as it's intentional.
- `src/app/api/calendar/route.ts`: Replaced manual `console.error` + `Response.json` 500 pattern with `handleApiError`

## Impact
- Code quality improvement, no behavior changes
- `handleApiError` handles Unauthorized checks, logging, and 500 responses in a single call
- Kaizen category: error-handling
