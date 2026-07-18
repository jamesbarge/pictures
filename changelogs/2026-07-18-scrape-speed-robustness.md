# /scrape speed + robustness (/scrape improvements, PR 3)

**PR**: #TBD
**Date**: 2026-07-18

## Changes
- `src/lib/jobs/scrape-all.ts`:
  - `runWave` → `runWaves(waves[], poolLabel, …)`: one shared concurrency pool across multiple registry waves. The full run now schedules Playwright (7) + Cheerio/API (20) independents through a single cap-4 pool — removing the wave barrier where one slow Playwright straggler blocked all 20 Cheerio scrapers. Total concurrency ceiling unchanged (4, same as each old wave), so memory headroom is identical. Returns one `WaveSummary` per input wave, so the Telegram digest shape is preserved; the fewest-screenings-first sort spans the combined set (a starved Cheerio venue outranks a healthy Playwright one). Chains keep their own pool (multi-venue giants with scaled wall-clock caps).
  - `createRunBreaker` gains a second, softer counter: N consecutive failures of ANY type (default 6, env `SCRAPE_BREAKER_ANY_THRESHOLD`) fires a **one-shot warn-level Telegram** ("Scrape failure streak — possible systemic issue") and continues. The abort condition stays connection-only: fewest-screenings-first deliberately front-loads broken cinemas, so several consecutive ordinary failures at run start are expected, and aborting on them would be a self-inflicted outage. Unit tests added (one-shot, non-aborting, reset-on-success, fallback message, connection-trip regression).
- `src/scripts/cleanup-upcoming-films.ts`: the main loop queried the full upcoming-films join 3×. Now: query once; re-query before phase 2 only if phase 1 updated titles (and not dry-run); before phase 3 only if phase 2 matched anything. A `--phase 4` run no longer queries films at all. Honest note: TMDB's 300ms rate-limit sleeps dominate this script's runtime — this is a small win taken because it's cheap.
- `src/scripts/audit-film-data.ts`: new `--fail-threshold N` — exits 1 when upcoming-film metadata issues (`missingPosterUpcoming + missingSynopsisUpcoming + missingLetterboxdRatingUpcoming + missingTmdbIdUpcoming`) exceed N. Deliberately gates on the uncapped summary counters, not `gaps.length` (capped at 200). Absent flag = current always-exit-0 behavior.
- `src/scripts/run-scrape-and-enrich.ts`: the audit phase passes `--fail-threshold` only when `SCRAPE_AUDIT_FAIL_THRESHOLD` is set (mirrors the `SCRAPE_REMATCH_SWEEP` opt-in pattern). Default off until a sane threshold is observed from a few runs.

## Impact
- Full-run wall clock: the Playwright→Cheerio barrier was the biggest scheduling dead-time in Phase 1; the shared pool removes it. Before/after timing comparable via `tmp/scrape-runs/` history (PR 1 artifact).
- Systemic mid-run failures (WAF/IP block, site-wide outage) surface on Telegram within minutes instead of at the end-of-run digest.
- The audit phase can act as a real quality gate once an issue-count baseline is chosen.

## Verification
- Unit: breaker warn-streak tests in `scrape-all.test.ts` (+ tsx smoke locally — vitest workers wedged on this machine; CI runs the suite).
- Live: `audit:films -- --fail-threshold 0` → exit 1; no flag → exit 0. `cleanup:upcoming --phase 4` (dry) no longer runs the films query.
- Full supervised `npm run scrape:unified` run on this branch exercising the merged pool end-to-end; per-wave digest rows intact.
- `npx tsc --noEmit` clean.
