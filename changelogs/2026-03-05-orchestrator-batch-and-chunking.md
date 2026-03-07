# Fix Orchestrator Batch Counting & Queue Contention

**Date**: 2026-03-05
**Branch**: `fix/orchestrator-batch-and-chunking`

## Problem

Third orchestrator run reported 4/31 succeeded, but API inspection showed 23/31 actually completed. Two root causes:

1. **Miscounting**: `Promise.allSettled(map(triggerAndWait))` doesn't work correctly with concurrent `triggerAndWait` calls — the SDK's checkpoint/resume mechanism only properly tracks ~1 per wave
2. **Queue contention**: Firing 17 Cheerio tasks at once exhausted worker slots; 8 tasks sat in queue for their entire `maxDuration` and timed out (durationMs=0, never executed)

## Changes

### `src/trigger/scrape-all.ts`
- **`batch.triggerAndWait()`**: Replaced `Promise.allSettled` + individual `triggerAndWait` with SDK's native batch API, which sends a single batch request and manages all waiting internally
- **Wave chunking**: Playwright wave split into batches of 4, Cheerio wave into batches of 6 — runs sub-batches sequentially within each wave to keep queue pressure manageable
- **`maxDuration` bump**: 3600 → 5400 (90 min) to accommodate sequential chunking overhead
- **Telegram alert**: Updated "Daily" → "Weekly" to match actual cron schedule

### `src/agents/fallback-enrichment/letterboxd.ts`
- Fixed regex at line 188: `^([\d.]+)\s+out\s+of\s+5$` → `^([\d.]+)\s+out\s+of\s+5(?:\s+stars)?$` to match Letterboxd's current format ("X.XX out of 5 stars")

## Expected Impact

- Orchestrator should correctly report ~23+ succeeded (was incorrectly 4)
- No more durationMs=0 queue timeouts
- Fallback Letterboxd enrichment should find ratings that were silently missed
