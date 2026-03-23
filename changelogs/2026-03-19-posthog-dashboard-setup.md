# PostHog Dashboard Setup via API

**PR**: TBD
**Date**: 2026-03-19

## Changes

### PostHog API Client (`src/lib/posthog-api.ts`)
- Added `createDashboard()`, `createInsight()`, `createAction()`, `createCohort()` write operations
- Added `listDashboards()`, `listActions()`, `listCohorts()` for idempotency checks
- Fixed stale `watchlist_changed` event name → `film_status_changed` in `getFilmEngagement()` (aligns with PR #400 event taxonomy cleanup)

### Setup Script (`scripts/setup-posthog-dashboards.ts`)
- New idempotent script that provisions PostHog resources via REST API
- **Dashboard 1 — Conversion Funnel**: Browse-to-book funnel, funnel by source, daily booking clicks, conversion rate over time
- **Dashboard 2 — Film & Cinema Engagement**: Top films by views/bookings, cinema performance, watchlist activity, repertory vs new releases
- **Dashboard 3 — User Retention & Segments**: Weekly retention, user lifecycle, engagement tiers, watchlist-to-booking funnel, new vs returning users
- **Dashboard 4 — Friction & Search Quality**: Search volume, no-results rate, filter dead ends, tonight empty states, top failed queries, filter usage
- **Cohorts**: Power Users, Bookers, Watchlisters, Search Frustrated
- **Actions**: Any Film Engagement, Booking Intent, Watchlist Add
- Skips creation when resources already exist (matches by name)

### Admin Analytics Page (`src/app/admin/analytics/page.tsx`)
- Surfaces film engagement data (top films by views, top films by bookings)
- Surfaces cinema engagement data (screening clicks, booking clicks by cinema)
- Added "Dashboards" link to PostHog dashboard list

## Impact
- Ops team can now view all key metrics in native PostHog dashboards without manual setup
- Admin page provides at-a-glance film & cinema performance data
- `getFilmEngagement()` now correctly tracks watchlist additions instead of stale event name
