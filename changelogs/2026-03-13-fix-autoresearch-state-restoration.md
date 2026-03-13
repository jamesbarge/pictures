# Fix AutoResearch state restoration + reporting accuracy

**PR**: #295
**Date**: 2026-03-13

## Changes
- AutoScrape catch block now restores config overlay on experiment failure (with `wroteCandidate` guard to skip restore when no overlay was written)
- AutoQuality catch block now restores threshold value on experiment failure (hoisted tracking variables outside try block)
- `buildOvernightSummary` uses last *kept* experiment's `metricAfter` instead of last experiment overall (prevents discarded experiments from inflating/deflating reported metrics)
- Kept experiments in AutoQuality now recompute full DQS breakdown via `runAudit()` instead of only patching `compositeScore` (ensures all 5 DQS components stay fresh for subsequent experiments)

## Impact
- Prevents config corruption when experiments crash mid-execution
- Overnight summary reports now accurately reflect the state of kept changes
- Subsequent experiments see correct DQS breakdown percentages after a kept change
