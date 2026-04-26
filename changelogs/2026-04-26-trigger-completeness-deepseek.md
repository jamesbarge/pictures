# Trigger.dev completeness push + DeepSeek-V4-Flash enrichment

**PR**: TBD
**Date**: 2026-04-26

## Context

`/data-check` had been catching dozens of issues per cycle that the Trigger.dev pipeline should have prevented at write-time:
- Events misclassified as films (NT Live, Royal Ballet, quizzes, comedy nights)
- Known-wrong TMDB matches (per `.claude/data-check-learnings.json`)
- Dodgy entries with bad years, runtimes, or all-caps titles

On top of that, `scrape-all-orchestrator` ran weekly Mondays only, so a Tuesday-breaking scraper meant six days of stale data. A 2026-04-26 audit (`scripts/audit/trigger-runs-audit.ts`) showed:
- 66 of 67 cinemas had no `cinema_baselines` row → `runner-factory.detectAnomaly()` returned null and never flagged anything
- 7 cinemas had zero scraper runs in the last 30 days (silent breakers)
- 5 cinemas hadn't been re-scraped in over 8 days
- Anomalies were being recorded in `scraper_runs` but never surfaced to a human

Separately, the user requested swapping the enrichment agent's AI provider from Google Gemini to DeepSeek-V4-Flash for cost/speed. Scope: only `src/agents/enrichment/index.ts`, not the QA analyzer or other Gemini callers.

## Changes

### Enrichment provider swap (Gemini → DeepSeek-V4-Flash)
- New `src/lib/deepseek.ts` — drop-in shape of `src/lib/gemini.ts`. Uses the already-installed `openai@^6.15.0` SDK with `baseURL: "https://api.deepseek.com"`. Forces `response_format: { type: "json_object" }` on `generateTextWithUsage` since the enrichment agent's two prompts both ask for JSON.
- `src/agents/enrichment/index.ts` — single import line flipped from `@/lib/gemini` to `@/lib/deepseek`. Both call sites (alt-title generation, match ranking) work unchanged because the existing JSON regex extraction is tolerant.
- `.env.local.example` — added `DEEPSEEK_API_KEY` with a comment clarifying that other AI callers still use `GEMINI_API_KEY`.

### Trigger.dev cadence and observability
- `src/trigger/scrape-all.ts` cron `0 3 * * 1` → `0 3 * * *` (weekly Monday → daily 3am UTC).
- Same file gains `summariseRunsSince(startedAt)` — joins `scraper_runs` with `cinemas` for runs within this orchestration window. Surfaces:
  - `status='anomaly'` runs (with type and baseline)
  - `status='failed'` runs (with error message from `anomalyDetails`)
  - `status='success'` with `screeningCount=0` (the silent-breaker fallback for cinemas with no baseline)
- Telegram alert now includes the digest and bumps level to `error` if anything failed, `warn` if any signals, else `info`.

### Daily-sweep data-quality passes
- New module `src/lib/data-quality/index.ts`:
  - `runNonFilmDetection()` — copy of Pass 2 patterns from `audit-and-fix-upcoming.ts` (live broadcast, concert, event, kids non-film). Films matching event patterns get hard-deleted; others get `contentType` reclassified.
  - `detectDodgyEntries()` — copy of Pass 7 heuristics (long titles, ALL CAPS without TMDB, year/runtime outliers, no-poster-no-synopsis-no-tmdb). Returns flagged entries; doesn't auto-delete.
  - `applyKnownTmdbCorrections()` — reads `.claude/data-check-learnings.json` and swaps wrong TMDB IDs for the curated correct ones, matched on lowercased title equality.
- `src/trigger/enrichment/daily-sweep.ts` — new "Phase 5" runs all three after the existing TMDB/Letterboxd/poster phases, gated by the same `isTimeBudgetExceeded` check. Telegram summary now includes counts.

### New audit tooling
- `scripts/audit/trigger-runs-audit.ts` — pulls 30 days of `scraper_runs`, identifies silent breakers, no-recent-run cinemas, recurring anomalies, recurring failures, and missing-baseline cinemas. Outputs `tasks/trigger-audit-YYYY-MM-DD.md` with full per-cinema breakdown.
- The first run (2026-04-26) is committed under `tasks/`.

## Impact

- Enrichment AI calls (~30/day across daily-sweep + admin endpoint) now hit DeepSeek-V4-Flash instead of Gemini. Other Gemini callers unchanged.
- Cinema scrapers run 7× more often (daily vs weekly). Trigger.dev concurrency: same waves, same chunking — no additional concurrency pressure since waves complete sequentially.
- Daily Telegram digest now flags scrapers that returned 0 screenings (regardless of baseline), which previously fired no signal in 66/67 cinemas.
- Daily-sweep auto-fixes ~3 categories of issues that previously required human `/data-check` invocation.

## Deferred

- **Pass 3 (duplicate-film cleanup)**: `cleanup-duplicate-films.ts` is a CLI script that needs refactoring into a callable module before it can run inside Trigger.dev cloud. Tracked for follow-up.
- **Pass 5 (tag validation)**: `wrong_new_tag` / `wrong_repertory_tag` auto-fix needs new logic that doesn't exist yet. Tracked for follow-up.
- **Stale-screening Tier-1 auto-delete**: needs a query that joins `screenings.updated_at` with `scraper_runs.completed_at` to confirm the cinema was re-scraped after the screening's last touch. Tracked for follow-up.
- **Cinema baseline backfill**: 66/67 cinemas have no baseline. Anomaly detection won't fully work until baselines are populated. Out of scope for this PR — would need a script to compute weekday/weekend averages per cinema from screening history.

## Verification

- `npx tsc --noEmit` clean for changed files (two pre-existing missing-types errors for `debug` and `google.maps` unrelated).
- `npx eslint <changed-files>` clean.
- `npx vitest run src/app/api/admin/agents/agents.test.ts src/agents/` — 25 passed.
- Live audit script exercised against prod DB; report generated at `tasks/trigger-audit-2026-04-26.md`.
- DeepSeek end-to-end smoke test pending — requires `DEEPSEEK_API_KEY` in `.env.local`.
