# Scraper Resilience - Session 1 Quick Wins

**PR**: #76
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

## Impact
- **Ops visibility**: Blocked scrapes now surface as failures instead of silent staleness
- **Reliability**: BFI proxy calls survive transient ScraperAPI failures
- **Fairness**: Jittered backoff prevents thundering herd on retries
- **Monitoring**: All scraper runs now recorded to `scraper_runs` table with anomaly detection
- **Process**: Self-improving notes system captures patterns for future sessions
