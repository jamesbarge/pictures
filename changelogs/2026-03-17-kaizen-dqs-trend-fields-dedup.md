# Kaizen — Extract DQS_TREND_FIELDS constant in dqs-snapshots

**PR**: #383
**Date**: 2026-03-17

## Changes
- Extracted 8 shared Drizzle select column mappings into a `DQS_TREND_FIELDS` constant
- `loadDqsTrend` uses `DQS_TREND_FIELDS` directly
- `getRunSnapshots` spreads `DQS_TREND_FIELDS` and adds `snapshotType`
- Eliminates duplicated field lists that could drift out of sync

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: duplicate-pattern
