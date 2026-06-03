# Add unit tests for src/db/safe-query.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/db/safe-query.test.ts` (new) — 9 vitest cases using `vi.resetModules()` + dynamic import to exercise both DATABASE_URL-set and DATABASE_URL-unset code paths.

## Coverage
- DATABASE_URL set + query succeeds → returns query result
- DATABASE_URL unset → returns fallback WITHOUT calling queryFn
- DATABASE_URL empty string → returns fallback
- **Pinned localhost exclusion**: `localhost:5432/postgres` is treated as "no DATABASE_URL" (the build-time CI guard). A future refactor that drops this exclusion would silently try to connect to a non-existent local DB during CI builds.
- DATABASE_URL set + query throws → fallback (error swallowed)
- Error is logged to console.error (observable)
- isDatabaseAvailable returns true/false matching the snapshot logic

## Why
`safeQuery` is the build-time resilience layer — Next.js page builds call DB-dependent queries through it so they don't crash CI when DATABASE_URL is absent. A regression that bypasses the fallback would crash production builds in environments without DB connectivity.

The localhost-exclusion is particularly worth pinning. It's a non-obvious branch that exists specifically to handle the "dev environment without postgres running" case — a casual cleanup PR that removes "this looks redundant" would break offline builds.

## Changelog deferral note
Per #523-#530.
