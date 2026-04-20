# Fix Cinema Detail Route Loader

**PR**: TBD
**Date**: 2026-04-19

## Changes
- Deleted `frontend/src/routes/cinemas/[slug]/+page.ts`
- Kept `frontend/src/routes/cinemas/[slug]/+page.server.ts` as the sole loader for cinema detail pages
- Removed the bad `/api/cinemas?id=${params.slug}` request path from the frontend
- Bumped `getUpcomingScreeningsForCinema` default limit from 100 → 200 in `src/db/repositories/cinema.ts` to preserve the screening count the deleted loader requested (it used `limit=200` on `/api/screenings`); the kept `/api/cinemas/[id]` endpoint calls this function without passing a limit

## Impact
- Cinema links opened from the map now resolve through the correct cinema detail loader
- Prevents cinema pages from hydrating with the wrong venue when the list endpoint returns the full cinema set ordered by name
- Leaves the existing server-side `/api/cinemas/[id]` detail fetch path as the canonical source for `/cinemas/{id}` routes
- Busy cinemas (BFI, PCC, Rio, Barbican during festivals) retain their full upcoming programme — without the limit bump, a silent cap at 100 screenings would have hidden roughly the back half of their future schedule
