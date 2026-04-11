# Fix Homepage — Show Full Month of Screenings

**PR**: #421
**Date**: 2026-04-11

## Changes
- Removed `?limit=200` from homepage API call in `+page.server.ts`
- Added explicit `endDate` parameter set to 30 days from now
- This switches from the cursor-paginated API path (capped at 200) to the legacy non-paginated path (returns all screenings in the date range)

## Root Cause
The `limit=200` parameter triggered cursor pagination in the screenings API. Since today alone has 250+ screenings, all 200 returned results were from today — zero future days appeared on the homepage.

## Impact
- Users now see a full month of screenings grouped by day (TODAY, TOMORROW, next week, etc.)
- ~3,000 screenings returned per ISR refresh (~2.5MB raw, ~500KB gzipped)
- ISR caches for 1 hour — the fetch cost is amortized across all users
