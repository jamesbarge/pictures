# Remove retired-scheduler, QA and never-wired modules from src/lib

**PR**: #PENDING
**Date**: 2026-10-04

## Changes
- Deleted `src/lib/jobs/daily-sweep.ts`, `post-scrape.ts` and `post-deploy-verify.ts` (737 lines). Their Trigger.dev wrappers were removed in #469 and nothing else called `runDailySweep`, `runPostScrapeEnrichment` or `runPostDeployVerify`. `.github/workflows/post-deploy-verify.yml` is curl-only and never ran the file. `jobs/scrape-all.ts` and `jobs/letterboxd-import.ts` stay.
- Deleted `src/lib/data-quality/index.ts` (221 lines), whose only importer was daily-sweep. `scripts/audit-and-fix-upcoming.ts` keeps the original non-film, dodgy-entry and TMDB-correction passes.
- Deleted `src/lib/enrichment/` (`title-variations.ts` and its test, 160 lines). Its only importers were daily-sweep and post-scrape.
- `src/lib/data-quality/load-thresholds.ts`: removed `loadThresholdsAsync` and the `nonFilmDetection` and `safetyFloors` sections from the interface, `thresholds.json` and the test. No code read either section after the AutoQuality harness was retired on 2026-05-03. `tmdb`, `duplicateDetection` and `dodgyDetection` stay; `audit-and-fix-upcoming.ts --thresholds` reads `dodgyDetection`.
- Deleted the whole `src/lib/qa/` pipeline (1,936 lines across `types.ts`, `booking-checker`, `db-fixer`, `front-end-extractor`, `gemini-analyzer`, `scope-classifier`, `title-utils`, `verify-before-fix`), plus `scripts/qa-dry-run.ts` (243 lines) and the 501 stub `src/app/api/admin/qa/route.ts`. The only scheduled caller was the Trigger.dev `qa-orchestrator`, stopped on 2026-08-10. `qa-dry-run.ts` was in no npm script or workflow, and its extractor targeted React-era selectors with `networkidle`, so it could not read the SvelteKit site.
- Deleted `src/lib/scraper-health/alerts.ts` and its test (325 lines). `sendHealthAlerts` had no callers and `generateHealthSummary` was used only by its test.
- `src/lib/scraper-health/index.ts`: removed `saveHealthSnapshot`, `postScrapeHealthCheck` and the `uuid` import, and rewrote the header. It claimed post-scrape and 7am cron runs; health checks run on demand from `/admin` and `GET /api/admin/health`.
- Deleted `src/lib/embeddings.ts`, `src/lib/embeddings-cosine.test.ts` and `src/lib/__tests__/embeddings.test.ts` (366 lines). The bge-m3/Ollama dedup module never gained a caller, and `judgeMatchCandidates` was a stub that returned null.
- Updated a comment in `src/scrapers/utils/film-write-guards.ts` that named daily-sweep.
- `src/lib/vision.ts` stays because CLAUDE.md documents it.

## Impact
- 4,119 lines removed across 26 files, with 4 lines added. Unit tests go from 2,566 to 2,503 as 5 test files for deleted code go with it; lint warnings drop from 61 to 59.
- No runtime behaviour changes. Every deleted export had zero callers in `src/`, `scripts/`, `frontend/`, package.json scripts and workflows.
- `POST /api/admin/qa` now returns 404 where it returned 501.
- The `health_snapshots` table has no writer. `GET /api/admin/health?history=true` already returned stale or empty history for that reason.
