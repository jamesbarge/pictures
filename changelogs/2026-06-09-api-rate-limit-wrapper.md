# Standardized API Rate-Limit Wrapper

**PR**: TBD
**Date**: 2026-06-09

## Changes
- Added `withRateLimit(config, prefix)` in `src/lib/rate-limit.ts`, preserving both static and dynamic Next.js route-handler signatures.
- Standardized blocked responses to HTTP 429 with `{ "error": "Too many requests", "code": "RATE_LIMITED" }`, `Retry-After`, and `X-RateLimit-Remaining: 0`.
- Migrated the directors, screenings, legacy search, search catalog, film search, people detail, cinema list/detail, film detail/similar, and user sync routes to the wrapper.
- Added a `paidApi` preset and applied it to `POST /api/travel-times`, which can trigger one or two paid Google Distance Matrix requests.
- Updated search and screenings route tests for the shared response contract and added direct wrapper and travel-times rate-limit coverage.

## Impact
- The paid travel-time endpoint can no longer be called without per-IP throttling.
- Public clients receive one predictable rate-limit error contract across API routes.
- Future routes can add rate limiting without duplicating IP extraction, check logic, or response construction.
