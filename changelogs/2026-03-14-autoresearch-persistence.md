# AutoResearch DB Persistence + Focused Optimization

**PR**: #335
**Date**: 2026-03-14

## Changes

### Core Fix: Learning Accumulation
- Created `autoresearch_config` DB table (key-value JSONB store) for persistent config
- `db-thresholds.ts`: DB-backed threshold loader/saver with `onConflictDoUpdate` upsert
- `load-thresholds.ts`: Added `loadThresholdsAsync()` that checks DB first via dynamic import
- `audit-wrapper.ts`: Warms threshold cache from DB before audit runs
- AutoScrape overlays now DB-backed with filesystem fallback for local dev

### Focused Optimization
- AutoQuality agent constrained to TMDB thresholds only (prompt + code enforcement)
- Cross-run experiment history (last 20) injected into agent prompt
- `MAX_EXPERIMENTS` reduced from 20 to 5 per weekly run
- `program.md` rewritten with strategy tips and explicit TMDB-only allowlist

### Performance
- `BaseScraper.loadConfigOverlay()` optimized: single `LIKE` query loads all overlays into module-level cache, avoiding 1 DB query per cinema (~59 queries reduced to 1)

### Diagnostics
- `scripts/autoresearch-status.ts`: Query experiment history, detect learning failures

## Impact
- AutoResearch runs now accumulate learning across deploys instead of resetting to defaults
- Each run starts where the previous one left off (provable via consecutive `metricBefore`/`metricAfter`)
- Agent avoids repeating failed experiments by seeing cross-run history
- Scrape-all pipeline no longer makes ~59 unnecessary DB queries for overlay lookups
