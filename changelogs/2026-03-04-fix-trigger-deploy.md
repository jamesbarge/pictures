# Fix Trigger.dev Production Deploy

**Date**: 2026-03-04
**Commits**: `c8bdfc4`, `9a0ed6f`
**Branch**: `main` (direct fixes)

## Problem

PR #135 merged 28 scraper tasks to Trigger.dev, but the GH Actions deploy workflow failed with two issues:

1. **Lockfile mismatch**: `npm ci` on Node 22 (npm 10) required `magicast@0.3.5` as a nested peer dependency of `c12` → `@prisma/config` → `@trigger.dev/build`. The lockfile was generated with npm 11 which omitted this resolution.

2. **Missing cinema registry entry**: `regent-street` cinema was defined in `db/seed.ts` but missing from the canonical `cinema-registry.ts`. The Trigger.dev indexer imports all task files at deploy time, and `regent-street.ts` calls `getVenueFromRegistry("regent-street")` at module scope, which threw.

## Fix

- Regenerated `package-lock.json` with npm 10.9.4 (matching CI) to include `magicast@0.3.5`
- Added `regent-street` definition to `src/config/cinema-registry.ts`
- Added `regent-street` to `src/inngest/known-ids.ts` for test coverage

## Verification

- `npm ci` passes on Node 22 / npm 10
- All 689 tests pass
- TypeScript compiles clean
- Deploy workflow succeeds: all tasks indexed and deployed to Trigger.dev production
