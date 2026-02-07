# Scraper Resilience - Session 1 Quick Wins

**PR**: #104
**Date**: 2026-02-06

## Changes

### Fix blocked scrape outcome semantics (Item 1.1)
- Added `blocked: boolean` flag to `PipelineResult` interface in `pipeline.ts`
- Runner now marks blocked scrapes as `success: false` with error `"scrape_blocked_by_diff_check"`
- Previously, blocked scrapes looked identical to "cinema has no upcoming screenings" — silent data staleness

### Add jitter to exponential backoff (Item 2.3)
- Changed deterministic backoff `1000 * Math.pow(2, retryCount - 1)` to `baseDelay * (0.5 + Math.random())`
- Prevents thundering herd when concurrent scrapers retry at the same moments

### Add BFI proxy retry logic (Item 2.4)
- Added `fetchWithRetry()` helper to both `bfi-pdf/fetcher.ts` and `programme-changes-parser.ts`
- ScraperAPI proxy calls now retry once after a 2-second delay on 5xx or network errors
- Handles transient ScraperAPI failures that previously caused full scrape failures

### Add scraper run recording with baseline anomaly detection (Item 3.4)
- Added `recordScraperRun()` fire-and-forget helper to `runner-factory.ts`
- Wired into all 5 exit paths (single-venue success, single-venue failure, blocked scrape, chain per-venue, chain failure)
- Compares screening counts against `cinema_baselines` table for anomaly detection
- Automatically upgrades `success` to `anomaly` status when deviation exceeds tolerance
- All recording is fire-and-forget — failures only logged, never break scraping

### Self-improvement notes system (Part B)
- Created `tasks/lessons.md` with initial entries documenting known issues
- Created `tasks/scraper-lessons.md` with scraper-specific patterns

## PR Review Fixes (2026-02-07)

### Fix recordScraperRun race condition
- `recordScraperRun` was fire-and-forget (`void`) but `createMain` calls `process.exit(1)` immediately after
- Added `pendingRecords` array to track all record promises
- Added `flushPendingRecords()` that awaits all pending writes (5s timeout)
- Called at end of `runScraper` and before `process.exit` in `createMain`

### Extract shared fetchWithRetry
- Identical 12-line function was copy-pasted in `fetcher.ts` and `programme-changes-parser.ts`
- Extracted to `src/scrapers/utils/fetch-with-retry.ts` with parameterized log labels

### Fix useValidation:false ignoring blocked flag
- When `useValidation` was false, `saveScreenings` return value was discarded
- Now captures `PipelineResult` and checks `blocked` in both single-venue and chain paths

### Fix load-bfi-manual.ts ignoring blocked flag
- Added `result.blocked` check after `processScreenings` with error message and `process.exit(1)`

### Fix chain venue cumulative durationMs
- All chain venues shared a single `startTime`, making later venues appear slower
- Added `venueStartTime = Date.now()` inside the per-venue loop

### Cleanup
- Removed unused `type PipelineResult` import
- Removed stale `// Exponential backoff: 1s, 2s, 4s` comment (superseded by jitter comment)

## Impact
- **Ops visibility**: Blocked scrapes now surface as failures instead of silent staleness
- **Reliability**: BFI proxy calls survive transient ScraperAPI failures
- **Fairness**: Jittered backoff prevents thundering herd on retries
- **Monitoring**: All scraper runs now recorded to `scraper_runs` table with anomaly detection
- **Data integrity**: Race condition fixed — DB writes complete before process shutdown
- **Accuracy**: Chain venue timing now reflects actual per-venue duration
- **Process**: Self-improving notes system captures patterns for future sessions
