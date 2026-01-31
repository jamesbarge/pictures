# Fix Screening Time Filtering

**PR**: #54
**Date**: 2026-01-31

## Changes

- `src/app/page.tsx` (line 55): Changed `startOfDay(now)` to `now` in the cached screenings query
- `src/app/api/screenings/route.ts` (line 78): Changed default `startDate` from `startOfDay(new Date())` to `new Date()`
- `src/app/api/films/search/route.ts` (line 49): Changed `startDate` from `startOfDay(new Date())` to `new Date()`

## Problem

Public-facing pages were using `startOfDay(now)` to filter screenings, which meant:
- A 10:00 AM screening would still appear at 3:00 PM
- Users saw screenings that had already started
- This violated the documented rule: "Filter past screenings using current time, not start of day"

## Solution

Changed all public-facing queries to use `new Date()` (current time) instead of `startOfDay(new Date())`:
- Home page (`/`)
- Screenings API (`/api/screenings`)
- Film search API (`/api/films/search`)

## Intentionally Unchanged

Admin pages correctly use `startOfDay()` for analytics:
- `src/app/admin/page.tsx` — daily stats need full day view
- `src/app/admin/screenings/page.tsx` — date picker selects full days
- `src/app/admin/anomalies/page.tsx` — compares full days for trends

## Impact

- Users now see only future screenings from the current time onward
- 2:00 PM screening disappears from view after 2:00 PM
- Cache behavior: 60-second revalidation means max 1-minute delay for changes
