# /scrape detection — yield-drop detector

**PR**: TBD (stacks on top of `feat/scrape-reliability-flaky-detector-bfi-healthcheck`)
**Date**: 2026-05-15

## Context

The two existing detectors leave a gap. `detectSilentBreakers` flags consecutive `success+0` runs (Prowlarr pattern). `detectFlakyCinemas` flags high `success+0` or `failed` ratios over a wider window. Both miss the "success + low-but-non-zero" case — a scraper that normally yields ~200 screenings and now consistently yields ~30 looks **healthy** to both detectors (the rows are `status=success` with `screening_count > 0`) even though the data is functionally broken.

Real example the detector is built for: a BFI PDF parser regression that silently drops one of the two venues from each parse, halving the yield without surfacing any failure.

## Changes

### `src/lib/scrape-quarantine.ts`

- `analyzeYieldDrop(rawRuns, thresholds)` — pure analyzer. Takes only successful runs, sorts by `startedAt` DESC internally, slices the most recent `recentWindow` runs as the "recent" sample and the next `baselineWindow` as the baseline. If `recentAvg / baselineAvg ≤ dropRatioCritical` → critical; `≤ dropRatioWarn` → warn; else null. Bails to null when baseline avg is below `minBaselineAvg` (avoids noise on small cinemas like BFI IMAX or Coldharbour Blue).
- `detectYieldDrop(thresholds)` — DB walker using the same single windowed query pattern as `detectFlakyCinemas` (`ROW_NUMBER() OVER (PARTITION BY cinema_id ORDER BY started_at DESC) <= recentWindow + baselineWindow`). Filters to `status='success'` so failures/empties don't pollute the math.
- `formatYieldDropReport(drops)` — slash-command-friendly output with 🔴 critical / 🟡 warn markers, percentage drop, and sample counts.
- `DEFAULT_YIELD_DROP_THRESHOLDS = { recentWindow: 5, baselineWindow: 20, minBaselineAvg: 20, dropRatioWarn: 0.5, dropRatioCritical: 0.3 }`. Calibrated so a 50%+ drop on a baseline ≥ 20 fires warn, and a 70%+ drop fires critical.
- Exports new types `YieldDropCinema`, `YieldDropSeverity`, `YieldDropThresholds`, `SuccessRunRecord`.

### `src/scripts/run-scrape-and-enrich.ts`

- Pre-flight phase now runs all three detectors in parallel (`detectSilentBreakers`, `detectFlakyCinemas`, `detectYieldDrop`) and reports a combined cinema-signal count.
- Post-run health-check phase does the same.

### `.claude/commands/scrape.md`

- `/scrape health` argument-handler updated to call `detectYieldDrop` + `formatYieldDropReport` alongside the existing detectors.

### `src/scrapers/SCRAPING_PLAYBOOK.md`

- "Health & Flakiness Detection" section now documents all three detectors with their threshold defaults.

### `src/scrapers/chains/curzon.ts`

- Updated the `active: false` comments for `curzon-camden`, `curzon-richmond`, `curzon-wimbledon` to note that a 2026-05-15 web search shows live public listings on `www.curzon.com/venues/<slug>/`. The Vista API endpoint still 401s without a prod-side JWT (Cloudflare blocks the auth-token bootstrap locally). Left inactive pending verification — flipping these would re-enable the chain scraper for them automatically.

### `src/lib/scrape-quarantine.test.ts`

- 10 new tests against the pure analyzer + formatter:
  - Returns null when below window-size requirement
  - Returns null on healthy ratio
  - Critical fires at ≤30%
  - Warn fires between 30-50%
  - Baseline-floor: small-cinema noise excluded
  - BFI 200→30 pattern fires critical
  - ASC input is sorted internally and produces correct recent/baseline split
  - Custom thresholds (`dropRatioWarn=0.7`) override defaults correctly
  - Formatter empty / non-empty cases
  - Helper bug-fix: `makeSuccessRun` now uses Date arithmetic, not string interpolation (`2026-05-${15-24}` produces invalid dates)

## Verification

- `npx vitest run src/lib/scrape-quarantine.test.ts` — 20 / 20 pass (10 flaky from prior PR + 10 new yield-drop)
- `npm run test:run` — 962 / 962 pass on the branch
- `npx tsc --noEmit` — clean
- `npx eslint <changed files>` — clean
- **Live replay** against production scraper_runs: detector ran in 461 ms, returned 0 false positives (no cinema currently meets the drop threshold, which is the right answer given the production fleet is healthy on yield).

## Impact

- **Detection coverage now 3-of-3 failure modes**: consecutive zeros (silent breaker), alternating empty/failed (flaky), low-but-non-zero (yield drop). Future regressions of any of the three shapes surface in `/scrape` pre-flight before the user invests 30-60 min of scraping.
- **Performance**: single windowed SQL, ~460 ms in live replay. Pre-flight cost is now ~1 s total for all three detectors combined.
- **No data changes** — this is purely additive read-only observability.

## Follow-ups

- After a few weeks of production data, tune `minBaselineAvg=20` if it's masking regressions on legitimately-small cinemas, or raise it if it's noisy.
- Verify the three inactive Curzon venues from a prod-side environment with a fresh JWT; flip `active: true` if the API actually returns dates.
- Consider extending `detectSilentBreakers` to use the same single-windowed SQL pattern (pre-existing N+1 — flagged in the prior PR's code review).
