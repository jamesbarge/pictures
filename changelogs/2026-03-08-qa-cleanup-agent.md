# QA Cleanup Agent — Daily Front-End Verification Pipeline

**Branch**: `feat/qa-cleanup-agent`
**Date**: 2026-03-08

## Changes

- New 3-task Trigger.dev pipeline that runs daily at 6am UTC:
  1. `qa-browse`: Playwright extracts films + screenings from pictures.london, verifies booking links with stealth browser support (BFI Cloudflare, Odeon, Curzon)
  2. `qa-analyze-and-fix`: Compares front-end data against DB, runs deterministic checks (stale screenings, missing Letterboxd) and AI-powered checks (TMDB mismatch, booking page verification), applies verified fixes
  3. `qa-orchestrator`: Coordinates the pipeline, sends 3-part Telegram report (findings, fixes, prevention recommendations)
- Scope classifier: detects systemic patterns (>=3 broken links from same cinema → critical alert, >=5 missing Letterboxd → enrichment schedule issue)
- Verification gate: all DB writes go through `verifyBeforeFix()` — TMDB re-matches require API cross-reference + UNIQUE constraint check + higher confidence than existing match
- Completeness guard: aborts if front-end extraction yields <70% of expected films
- Monday overlap guard: skips QA if scrape-all might still be running
- Added `DataIssueType` values: `front_end_db_mismatch`, `booking_page_wrong_film`
- Registered QA tasks in alert tier system (orchestrator = P1, sub-tasks = P2)
- Admin API: POST `/api/admin/qa` with optional `{ dryRun: boolean }` body
- DRY_RUN=true default for safe rollout (first 2 weeks)

## New Files (12)

- `src/trigger/qa/types.ts` — Shared interfaces
- `src/trigger/qa/orchestrator.ts` — Daily scheduler
- `src/trigger/qa/browse.ts` — Playwright extraction task
- `src/trigger/qa/analyze-and-fix.ts` — Analysis + fix pipeline
- `src/trigger/qa/utils/front-end-extractor.ts` — DOM scraping functions
- `src/trigger/qa/utils/booking-checker.ts` — Booking link verification with stealth + retry
- `src/trigger/qa/utils/gemini-analyzer.ts` — Gemini prompts (flash-lite for checks, pro for prevention report)
- `src/trigger/qa/utils/scope-classifier.ts` — Spot vs systemic classification
- `src/trigger/qa/utils/verify-before-fix.ts` — Double-check gate
- `src/trigger/qa/utils/db-fixer.ts` — DB operations with audit trail
- `src/trigger/qa/utils/title-utils.ts` — Title normalization
- `src/app/api/admin/qa/route.ts` — Admin API endpoint

## Modified Files

- `src/agents/types.ts` — Added 2 new DataIssueType values
- `src/trigger/utils/alert-tiers.ts` — Registered QA tasks in tier system

## Impact

- Data quality: automated daily verification catches issues between weekly scrapes
- Front-end accuracy: verifies what users actually see matches the DB
- Faster issue detection: systemic problems (broken cinema links) caught within hours, not days
- Audit trail: all fixes logged to `data_issues` table with `agentName: 'qa-cleanup'`
