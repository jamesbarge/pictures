# Kaizen — Remove unused getRunSnapshots function

**PR**: #385
**Date**: 2026-03-17

## Changes
- Removed `getRunSnapshots(runId)` from `dqs-snapshots.ts` — function had zero importers across the codebase
- The function was added as part of the DQS snapshot feature (#365) but the harness only uses `loadDqsTrend()` and `saveDqsSnapshot()`
- Can be re-added from git history if needed in the future

## Impact
- Code quality improvement, no behavior changes
- Reduces module surface area to what's actually consumed
- Kaizen category: dead-code
