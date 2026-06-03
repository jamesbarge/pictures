# /scrape reliability — flaky-cinema detector, BFI yield gate, healthCheck retry

**PR**: TBD
**Date**: 2026-05-15

## Context

A 7-day snapshot of `scraper_runs` against production data exposed three patterns the existing health-detection couldn't see:

| Cinema | Pattern | Why hidden |
|---|---|---|
| BFI IMAX | 14/21 success+0 (67% empty) | Alternating empty/non-empty — never 2 in a row |
| BFI Southbank | 10/20 success+0 (50% empty) | Same alternating pattern |
| Close-Up | 3/9 outright failed (33%) at 03:17-03:21 UTC | Brief nightly-maintenance window; single-shot healthCheck timed out |

The Prowlarr-style `detectSilentBreakers` only flags ≥N *consecutive* `success+0` runs, so all three of these slipped past. The two BFI venues were also correlated: a single Cloudflare-blocked `loadBFIScreenings()` call returned `[]`, was cached in `bfiLoadPromise`, and both `bfi-southbank` and `bfi-imax` then recorded `success+0` from the poisoned cache.

## Changes

### 1. Ratio-based flaky-cinema detector (`src/lib/scrape-quarantine.ts`)

- New `analyzeRunsForFlakiness(rawRuns, thresholds)` — pure function, DB-free, unit-testable.
  Sorts inputs by `startedAt` DESC internally so callers may pass any order.
- New `detectFlakyCinemas(thresholds)` — calls the analyzer for every active cinema using a single windowed query (`ROW_NUMBER() OVER (PARTITION BY cinema_id ORDER BY started_at DESC) <= lookback`). Replaces 60 per-cinema round-trips with one query; pre-flight dropped from ~2s to ~340ms in live replay.
- New `formatFlakyReport(flaky)` — slash-command-friendly output with 🔴 critical / 🟡 warn markers.
- New `DEFAULT_FLAKY_THRESHOLDS` — `minRuns=4, lookback=10, emptyRatioWarn=0.3, emptyRatioCritical=0.5, failedRatioWarn=0.3, failedRatioCritical=0.5`. Calibrated against the three patterns above. Tunable by callers without changing call-sites.

### 2. BFI yield gate + cache-bust (`src/scrapers/cinemas/bfi.ts`)

- `getOrLoadBFIScreenings()` now exported; inspects `sourceStatus` from `loadBFIScreenings()` and **throws** when both PDF and programme-changes sources failed. The runner-factory records `status=failed` instead of masking the Cloudflare block behind a `success+0` row.
- The shared `bfiLoadPromise` cache now busts on rejection via `.catch(err => { bfiLoadPromise = null; throw err; })`. A failed call by one BFI venue no longer poisons the other.
- `BFIScraper.scrape()` no longer wraps the load call in `try/catch → return []`. The runner-factory wraps every scraper in its own try/catch and isolates failures per cinema, so throwing is the correct posture.
- New test-only export `_resetBFIScreeningsCacheForTests()`.

### 3. `BaseScraper.healthCheck` retry-with-backoff (`src/scrapers/base.ts`)

- 3 attempts, 10s timeout each, 4s gap between attempts. Worst-case ~38s; only on the unhealthy path.
- Fast-fails on 4xx (contract issue); retries on 5xx + network errors. The May 2026 Close-Up "site not accessible" failures all happened in a 4-minute window and the site recovered within seconds — a brief retry rescues them.
- Subclasses can still override (e.g. Curzon's API-endpoint health probe with 401-is-healthy contract).

### 4. Pipeline wiring (`src/scripts/run-scrape-and-enrich.ts`)

- Pre-flight phase now runs both `detectSilentBreakers` *and* `detectFlakyCinemas` in parallel, prints both reports, and surfaces a combined count.
- Post-run health-check phase does the same.

### 5. Tests

- 10 tests for the flaky detector: thresholds, severity escalation, pattern recognition for each production pattern (BFI IMAX, BFI Southbank, Close-Up), `lastGoodRunAt` recording, custom thresholds, formatter output.
- 6 tests for the BFI yield gate + cache: success on either source returns data; both-fail throws; both-empty also throws; failures don't poison the cache; successes do cache.
- 5 tests for the healthCheck retry: first-attempt success; recovery on retry 2; no-retry on 4xx; network-error retry; eventual give-up after 3 attempts.

## Verification

- `npm run test:run` — 952 tests pass (+21 new from this change, up from 931 baseline)
- `npx tsc --noEmit` — clean
- `npx eslint <changed files>` — clean
- Live replay of `detectFlakyCinemas()` against production DB returned exactly the 3 expected cinemas with correct severities; query ran in 343 ms (vs ~2 s for the previous per-cinema-loop shape)

## Impact

- **Operationally:** `/scrape` pre-flight will now surface cinemas like BFI IMAX before the user sits through a 30-60 min run that just re-records `success+0`. The detector's first useful firing reveals 3 actively-flaky venues that were invisible before.
- **Data quality:** BFI runs that previously stored `success+0` (and looked healthy in the dashboard) will now correctly record `status=failed`. Both venues will be retried by the runner-factory's 3-attempt loop, so the *change* should produce more `failed` rows in the short term and *fewer* `success+0` rows that masked real outages.
- **Performance:** Pre-flight phase ~6× faster on a 60-cinema fleet. AutoScrape's nightly cadence benefits proportionally.
- **Coverage:** This change is the prerequisite for adding new London cinemas (Phase 4 audit in Obsidian — top priorities are Bertha DocHouse + Cinema Museum). Without the detection fix, new additions would have added more silent unreliability.

## Follow-ups

- Implement Bertha DocHouse scraper (see `Pictures/Audits/2026-05-15-london-coverage-audit.md` in the Obsidian vault).
- Investigate Cinema Museum + re-audit inactive Curzon/Everyman DB rows.
- Optionally: extend `detectSilentBreakers` to use the same single-windowed SQL pattern as `detectFlakyCinemas` (currently pre-existing N+1).
