# Fix Duplicate Screenings & Split Cinema IDs

**Date**: 2026-02-25
**Type**: Bug Fix
**Impact**: Data integrity — eliminates 210 duplicate screenings across the system

## Problem

Production API audit revealed 210 duplicate screenings:
- **70 split-cinema duplicates**: Same film+time under two different cinema IDs for the same physical venue (e.g., `close-up` AND `close-up-cinema`)
- **140 same-cinema duplicates**: Identical screenings within a single cinema ID caused by duplicate film records

## Root Causes

1. **V2 Runner ID Mismatch**: 6 v2 runner scripts used legacy cinema IDs while Inngest cron jobs used canonical IDs. The runner-factory passed `venue.id` directly to pipeline functions.
2. **Duplicate Film Records**: Same movie creating two film records with different filmIds, bypassing the unique screening index.
3. **Twin Peaks Title Splitting**: `cleanFilmTitle()` colon handler treated "Twin Peaks" as a short event prefix and stripped it.

## Changes

### Central ID Canonicalization (`src/scrapers/runner-factory.ts`)
- All pipeline calls (`processScreenings`, `saveScreenings`, `ensureCinemaExists`) now resolve legacy IDs through `getCanonicalId()` before use
- Fixes all 6 affected runners and prevents future legacy ID leaks

### Inngest ID Consistency
- `src/inngest/functions.ts`: Changed `"nickel"` → `"the-nickel"`, `"phoenix"` → `"phoenix-east-finchley"` in scraper registry
- `src/inngest/known-ids.ts`: Updated `SCRAPER_REGISTRY_IDS` to match
- `src/config/cinema-registry.ts`: Removed `INNGEST_ID_OVERRIDES` for nickel and phoenix

### Title Pattern Fixes (`src/lib/title-patterns.ts`, `src/scrapers/pipeline.ts`)
- Added `"twin peaks"`, `"blade runner"`, `"john wick"`, `"planet of the apes"` to `FRANCHISE_PREFIXES`
- Added same patterns to `isFilmSeries` regex in `cleanFilmTitle()`

### Pipeline Insert Idempotency (`src/scrapers/pipeline.ts`)
- Added `onConflictDoUpdate` on unique index `(filmId, cinemaId, datetime)` to handle race conditions
- Added secondary dedup guard: checks for existing screening at `(cinemaId, datetime)` with different filmId but same normalized title

### Migration Enhancement (`src/db/migrations/canonicalize-cinema-ids.ts`)
- Enhanced to handle collisions: if migrating a legacy-ID screening would conflict with an existing canonical-ID screening, the legacy duplicate is deleted instead

### Verification Script (`scripts/verify-screening-integrity.ts`)
- 4 SQL assertions: no legacy IDs, no duplicate screenings, unique index exists, no split-cinema pairs

## Cleanup Scripts (run in order)

```bash
npx tsx src/db/migrations/canonicalize-cinema-ids.ts --apply  # Phase 1
npx tsx scripts/cleanup-duplicate-films.ts                    # Phase 2
npm run db:cleanup-screenings --execute                       # Phase 3
npx tsx scripts/verify-screening-integrity.ts                 # Verify
```
