# Kaizen — Unexport 8 Dead Type Exports

**PR**: #390
**Date**: 2026-03-17

## Changes
- Removed `export` from `UserProductData` in `src/lib/posthog-supabase-sync.ts`
- Removed `export` from `AlertType` in `src/lib/scraper-health/index.ts`
- Removed `export` from `AlertContext` in `src/trigger/utils/alert-tiers.ts`
- Removed `export` from `ConfidenceResult` in `src/agents/fallback-enrichment/confidence.ts`
- Removed `export` from 4 interfaces in `src/scrapers/__tests__/snapshot.ts`: ScreeningSnapshot, ScraperSnapshot, SnapshotComparison, SnapshotDifference
- All 8 types had zero external importers

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Completes the dead type export sweep — all known candidates processed
