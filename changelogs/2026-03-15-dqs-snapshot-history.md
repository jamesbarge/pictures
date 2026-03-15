# DQS Snapshot History & Validation Pipeline

**Date**: 2026-03-15

## Changes
- Created `dqs_snapshots` table (migration 0009) to record DQS at start/end of every AutoQuality run
- Added `dqs-snapshots.ts` module with `saveDqsSnapshot()`, `loadDqsTrend()`, `formatDqsTrend()`
- Added `spot-checks.ts` module with user-facing validation queries (films with no poster, low-confidence TMDB matches, homepage metadata completeness)
- Wired DQS snapshots into AutoQuality harness — each run now records start/end snapshots with a UUID run ID
- Added 4-week DQS trend to Telegram overnight report (e.g., `DQS TREND: 72.3 → 74.1 → 74.8 → 75.2`)
- Added spot-check results to Telegram report for independent validation of DQS improvements

## Impact
- AutoQuality runs now create a time-series of DQS scores, enabling trend analysis across weeks/months
- Telegram reports include both the DQS trend and independent spot-check metrics, implementing "don't trust the loss" validation
- Low-confidence TMDB match monitoring catches Goodhart's Law problems — if DQS improves by matching more films at lower confidence, the spot-check will flag it
