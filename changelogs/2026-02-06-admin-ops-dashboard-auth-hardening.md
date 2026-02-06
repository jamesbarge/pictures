# Admin Ops Dashboard + Admin Auth Hardening

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Replaced the `/admin` homepage with an operations-focused dashboard:
  - Health summary cards (healthy/warning/critical/stale).
  - Immediate-attention queue for critical cinemas.
  - Full cinema health matrix with scraper freshness, volume, chain comparison, anomaly flags, and per-cinema re-scrape controls.
- Standardized admin authorization:
  - Added shared admin email allowlist helpers in `src/lib/admin-emails.ts`.
  - Added `requireAdmin()` in `src/lib/auth.ts` to enforce admin access in API routes.
  - Updated all `/api/admin/*` routes to use the shared guard instead of `userId`-only checks.
  - Updated `src/middleware.ts` to enforce admin checks for both `/admin/*` and `/api/admin/*`.
  - Added a server-side admin guard in `src/app/admin/layout.tsx` for defense in depth.
- Fixed health truthfulness gap in `src/lib/scraper-health/index.ts`:
  - Freshness now uses `cinemas.lastScrapedAt` (with `screenings.scrapedAt` fallback), so successful zero-result scrapes are represented correctly.
- Fixed admin screenings update issues:
  - `cinemaId` validation in `PUT /api/admin/screenings/[id]` now accepts canonical cinema IDs instead of UUID-only validation.
  - Removed writes to non-existent `manuallyEdited`/`editedAt` columns from screening update routes.
- Updated admin API test mocks to include `currentUser` and admin email context for hardened auth behavior.
- Added ESLint ignore pattern for local `.tmp-*.js` scripts to prevent local temp analysis files from breaking lint runs.

## Impact
- Admin UI is now operationally useful for triage and manual intervention.
- Non-admin signed-in users are now blocked consistently from admin APIs and pages.
- Scraper health signals are more accurate for stale-detection decisions.
- Admin screening edit endpoints are less error-prone in production.
