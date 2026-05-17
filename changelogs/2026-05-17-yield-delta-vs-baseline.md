# /scrape post-run — delta-vs-baseline report

**PR**: TBD
**Date**: 2026-05-17

## Context

The yield-drop detector (#506) requires 25 successful runs per cinema before it can fire — a stable but slow signal. For day-to-day operations users want to see "this run vs the recent baseline" surfaced inline, even for cinemas with only a handful of historical runs.

This is the UX surfacer the code reviewer flagged in #496's review: "Consider exposing the delta in the post-run report: 'BFI IMAX: warn → warn (was 5/10, now 5/10 incl. this run's success)'".

## Changes

### `src/lib/scrape-quarantine.ts`

- New `YieldDelta` interface — cinemaId, name, currentCount, baselineMean, baselineSamples, ratio, pctChange.
- New `detectYieldDeltaSinceBaseline(options?)` — single windowed SQL:
  1. `ranked` CTE: rank successful runs per cinema by `started_at DESC`
  2. `latest`: row with `rn = 1` per cinema (current run)
  3. `baseline`: AVG over rows with `rn > 1` AND `started_at` within `baselineDays` of latest
  4. Join + filter: only rows where `current < baseline * dropThreshold` AND `baseline >= minBaseline`
- New `formatYieldDeltaReport(deltas)` — slash-command-friendly output.
- Defaults: `baselineDays=7, dropThreshold=0.7, minBaseline=10`.

### `src/scripts/run-scrape-and-enrich.ts`

- New Phase 5: "Per-run delta vs 7-day baseline" runs after the existing health-check phase, prints the delta report.

### `src/lib/scrape-quarantine.test.ts`

- 2 new formatter tests (empty + populated). The SQL function is integration-verified live; unit-testing it would require mocking drizzle's `db.execute`, which is brittle for this PR's scope.

## Verification

- `npm run test:run` — 990 / 990 pass
- `npx tsc --noEmit` — clean
- **Live verification** against production scraper_runs: 394 ms; surfaces 3 Everyman venues (Maida Vale, Hampstead, Stratford International) with current run yield 30-35% below their 7-day baseline mean. Real signal worth investigating.

## Impact

- `/scrape` post-run summary now shows day-to-day yield regressions before they grow into the multi-run patterns the yield-drop detector catches.
- Single SQL query (~400 ms) — no per-cinema fan-out.
- No false-positive UI risk: thresholds calibrated to suppress small-cinema noise.

## Follow-ups

- Tune `minBaseline` if real-world signal/noise ratio is off after a few weeks
- Consider surfacing the delta alongside post-run summary stats too (currently a separate phase)
