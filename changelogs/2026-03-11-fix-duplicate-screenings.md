# Fix Duplicate Screenings at Same Cinema/Time

**Branch**: `data-loop`
**Date**: 2026-03-11

## Problem

Film detail pages showed duplicate screenings at the same cinema and time. The specific case: "Bloody Muscle Body Builder in Hell" at The Nickel showed two identical screenings.

**Root cause**: The CLI (`cli.ts`) registered The Nickel with `id: "nickel"`, while the scraper config (`the-nickel.ts`) used `cinemaId: "the-nickel"`. This created two cinema records in the DB, each accumulating their own screenings. When the same film was scraped under both IDs, it appeared twice on the film detail page.

## Changes

### Primary fix: Cinema ID consistency (`src/scrapers/cli.ts`)
- Changed CLI entry from `id: "nickel"` to `id: "the-nickel"` matching the scraper config
- Now references `NICKEL_VENUE` config directly instead of duplicating venue metadata

### Data migration (`scripts/merge-nickel-cinemas.ts`)
- Merged 47 screenings from `nickel` → `the-nickel` (all 47 were exact conflicts, deleted)
- Deleted stale `nickel` cinema record

### Preventive: Timestamp normalization (`src/scrapers/pipeline.ts`)
- Added `normalizeTimestamp()` to zero seconds/ms before all DB operations
- Prevents future sub-minute timestamp drift between scrapers

### Defense in depth: Time-window dedup (`src/scrapers/utils/screening-classification.ts`)
- Added Layer 1.5: same filmId + cinemaId within ±2 minutes
- Widened Layer 2: cross-film dedup now uses ±2min window instead of exact match

### Scripts
- `scripts/diagnose-duplicate-screenings.ts` — read-only diagnostic
- `scripts/cleanup-duplicate-screenings.ts` — enhanced with near-duplicate detection

## Impact
- Film detail pages no longer show duplicate screenings
- The Nickel now has a single cinema record with 66 screenings
- Future scraper runs are protected by timestamp normalization and time-window dedup
