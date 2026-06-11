# User Sync Contract And FK Safety

**PR**: #652
**Date**: 2026-06-09

## Changes
- Added a race-safe shared helper that creates the `users` parent row before every FK-backed user-data write.
- Fixed the production Svelte pull-sync client to consume the film-status map returned by the API.
- Switched the remaining festival follow caller to the canonical slug endpoint and removed the duplicate festival-ID endpoint.
- Added focused regression tests for user-row creation and the frontend sync contract.

## Impact
- New users can save watchlists, preferences, festival follows, schedules, and Letterboxd imports without first-write FK failures.
- Server film statuses are restored to the production frontend when a user signs in.
