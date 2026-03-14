# AutoResearch Trigger.dev Tasks + Audit Wrapper

**PR**: #TBD
**Date**: 2026-03-14

## Changes
- Created `src/trigger/autoresearch/autoscrape.ts` — Trigger.dev task + cron schedule for AutoScrape (nightly 1am UTC)
- Created `src/trigger/autoresearch/autoquality.ts` — Trigger.dev task + cron schedule for AutoQuality (weekly Sunday 2am UTC)
- Created `src/autoresearch/autoquality/audit-wrapper.ts` — bridges `auditFilmData()` to DQS-ready shape with `countDuplicateFilms()` and `countDodgyFilms()` queries
- Updated `.github/workflows/deploy-trigger.yml` to include `src/autoresearch/**` in deploy trigger paths
- Removed 3 scheduled tasks to free Trigger.dev slots (10/10 limit):
  - `enrichment-bfi-pdf` (Sunday 6am UTC)
  - `enrichment-festival-watchdog` (Thursday 6am UTC)
  - `enrichment-festival-reverse-tag` (Monday 9am UTC)
- Cleaned up references in `scrape-all.ts` and `qa/analyze-and-fix.ts`

## Architecture
- Follows QA orchestrator pattern: cron wrapper delegates to regular task (both API-triggerable and cron-schedulable)
- AutoScrape skips Monday runs (overlap guard for scrape-all at Mon 3am UTC)
- Dynamic imports used in task `run` functions to avoid bundling issues with Trigger.dev
- `runAuditForDqs` passed directly as the `runAudit` callback — signature matches the harness's dependency injection interface

## Known Limitation (v1)
Trigger.dev cloud has ephemeral filesystem. Threshold changes (AutoQuality) and overlay fixes (AutoScrape) written during a run don't persist across runs. Each scheduled run explores independently and reports via Telegram + DB. Local slash commands (`/autoscrape`, `/autoquality`) have full persistence.

## Impact
- AutoResearch systems now have entry points and scheduling
- Broken scrapers will be automatically detected and repair-attempted nightly
- Data quality thresholds will be automatically tuned weekly
- All experiment results logged to `autoresearch_experiments` table + Telegram alerts
