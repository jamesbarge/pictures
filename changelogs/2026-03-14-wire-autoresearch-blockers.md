# Wire AutoResearch Foundational Blockers

**PR**: #295
**Date**: 2026-03-14

## Changes
- Added `autoresearchExperiments` table to DB schema (`src/db/schema/admin.ts`) with `experiment_system` pgEnum, metrics columns, and NOT NULL `durationMs`
- Created SQL migration `0007_add_autoresearch_experiments.sql` with indexes and RLS policy for service role
- Created shared threshold loader (`src/autoresearch/autoquality/load-thresholds.ts`) that reads from `thresholds.json`
- Wired `loadThresholds()` into `scripts/audit-and-fix-upcoming.ts` — dodgy detection now uses tunable thresholds instead of hardcoded values
- Wired `loadThresholds()` into `scripts/cleanup-duplicate-films.ts` — trigram similarity threshold now reads from thresholds.json
- Removed old `loadThresholdOverrides()` function and `--thresholds` CLI flag (replaced by shared loader)
- Created `src/autoresearch/autoscrape/scraper-registry.ts` — builds ScraperFactory[] from cinema registry using dynamic imports

## Impact
- **AutoQuality**: Threshold tuning now actually affects audit behavior (previously blocker #2)
- **AutoScrape**: Scraper factory registry provides the ScraperFactory[] needed by the harness
- **DB logging**: Migration creates the table that experiment-log.ts writes to (previously blocker #3)
- ConfigOverlay + runScraperForYield already existed on the feature branch (blocker #1 was already resolved)
