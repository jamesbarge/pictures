# PostHog Analytics Cleanup — Event Taxonomy, Source Tracking, Empty States

**PR**: #399
**Date**: 2026-03-18

## Changes

### Phase 1: Event Taxonomy Cleanup
- Replaced inline `posthog.capture()` in `screening-card.tsx`, `film-card.tsx`, `film-screenings.tsx` with centralized `trackScreeningClick()` and `trackBookingClick()` from `analytics.ts`
- Consolidated film status events: single `film_status_changed` per action (was 3-4 events per watchlist add)
- Unified filter event names: `film_screening_filter_changed` and `film_detail_filter_toggle` → `filter_changed` with `context: "film_detail"`
- Removed dead code: `trackFunnelStep`, `captureError`, `trackTiming`, `startTimer`, `trackWatchlistChange`, `trackFilmMarkedSeen`, `trackFilmMarkedNotInterested`

### Phase 2: Missing Properties
- Added `DiscoverySource` type (`calendar | search | tonight | map | watchlist | shared_link | film_detail`)
- Added `source` parameter to `trackFilmView()`, `trackScreeningClick()`, `trackBookingClick()`
- Added `is_watchlisted` boolean to booking click events for conversion analysis

### Phase 3: Cinema Events
- Added `trackCinemaViewed(cinemaId, cinemaName, source)` and `trackCinemaFilterApplied(cinemaId, cinemaName)`
- Wired `trackCinemaViewed` into cinema name links on film detail page

### Phase 4: Empty State / Friction Tracking
- `search_no_results` fires when search returns 0 results (with query)
- `filter_no_results` fires when active calendar filters produce empty results
- `tonight_no_screenings` fires when tonight page has no screenings

## Impact
- **PostHog data quality**: Cleaner event taxonomy with consistent property shapes across all tracking points
- **Product insights**: Can now measure discovery paths (source), watchlist-to-booking conversion, and user friction points
- **Code quality**: 12 files changed, net -73 lines (179 added, 252 removed). Removed direct PostHog dependency from 5 components
