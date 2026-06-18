# Scrape Circuit Breaker and Per-Venue Wall-Clock Cap

**PR**: pending
**Date**: 2026-06-12
**Plan**: `plans/001-scrape-run-circuit-breaker.md`

## Changes

### Run-level circuit breaker (`src/lib/jobs/scrape-all.ts`)
- New `createRunBreaker(threshold, onTrip)`: tracks consecutive connection-level
  scraper failures across all waves. Default threshold 3, override via
  `SCRAPE_BREAKER_THRESHOLD` (floored at 1).
- `runWithConcurrency` now accepts a `shouldStop` callback. Once the breaker
  trips, workers stop pulling new tasks and unstarted entries are recorded as
  rejected with reason `circuit breaker tripped`.
- `runScraperEntry` feeds the breaker after every entry: connection errors
  (detected from per-venue error messages and the thrown-error path) increment
  the consecutive counter; any success or ordinary site failure resets it to 0.
- Tripping emits a structured console error and a Telegram alert naming the
  failure count and the last failing cinema. Subsequent waves and the
  enrichment wave are skipped once tripped (they would only hammer the same
  wedged database).

### Per-venue wall-clock cap (`src/scrapers/runner-factory.ts`)
- New exported `isConnectionError(err)`: classifies DB connection/pooler
  failures (client-side timeouts, `ECONNREFUSED`, pool exhaustion, Postgres
  `57014`, terminated connections) as non-retryable at run level, distinct
  from ordinary per-site scrape errors.
- New hard wall-clock cap around the entire venue unit (`runSingleVenue`:
  health check, scrape, pipeline phases including `cleanup-superseded`, and
  all retries). Default 10 minutes; override via `SCRAPE_VENUE_TIMEOUT_MS`
  (floored at 60s). On expiry the venue is recorded as a failed scraper run
  and the loop continues to the next venue.
- Chain scrapers (`scrapeVenues` fetches all venues in one call) get the same
  cap scaled by venue count; a timeout flows into the existing chain catch
  that marks all requested venues failed.
- The cap's error message intentionally contains "timeout" so capped venues
  count toward the run-level breaker.

### Tests
- `src/scrapers/runner-factory.test.ts` (new): `isConnectionError`
  classification (connection vs site errors vs non-Error values) and a
  fake-timer test proving a venue wedged forever is aborted at the cap while
  the next venue still runs.
- `src/lib/jobs/scrape-all.test.ts` (new): breaker trips after K consecutive
  connection failures, resets on interleaved success, ignores ordinary site
  failures, and `runWithConcurrency` stops pulling tasks once tripped while
  recording the remainder as `circuit breaker tripped`.

## Impact
- **Operators**: a `/scrape` run against a wedged Supabase pooler now aborts
  in minutes with a Telegram alert, instead of the 13.7-hour cascade of
  2026-06-09 (four venues looping ~13.4h each, pooler slots exhausted,
  production DB offline) or the 50/25-minute silent hangs of 2026-06-11.
- **Data**: no behavioural change for healthy runs — successful venues and
  ordinary site failures behave exactly as before; the breaker counter resets
  on any non-connection outcome.
- **Tuning knobs**: `SCRAPE_VENUE_TIMEOUT_MS` (per-venue cap, min 60s) and
  `SCRAPE_BREAKER_THRESHOLD` (consecutive connection failures before abort).

## Context
- The 2026-06-11 wedge happened on an await *between* pipeline phases (after
  the film loop, before `cleanup-superseded`) with zero log output for 50
  minutes. That code path runs inside `processScreenings`, which is called
  from `runSingleVenue` — i.e. inside the new venue cap — so the watchdog
  requirement is covered by the cap for single/multi-venue scrapers. For
  chain scrapers, post-`scrapeVenues` per-venue pipeline processing sits
  outside the scaled chain cap; its inner DB calls remain bounded by
  `withDbTimeout` only (noted as a residual gap).
- `src/db/index.ts` (`withDbTimeout`, pool settings) intentionally untouched —
  the breaker and cap are separate layers above the per-query ceiling.
