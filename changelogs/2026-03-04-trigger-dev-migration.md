# Scraper Consolidation: Trigger.dev Migration

**PR**: TBD
**Date**: 2026-03-04

## Changes

### Infrastructure
- Installed `@trigger.dev/sdk`, `@trigger.dev/build`, `@esbuild-plugins/tsconfig-paths`
- Created `trigger.config.ts` with Playwright build extension and tsconfig-paths resolution
- Created `.github/workflows/deploy-trigger.yml` for automated deployment on push to main

### Scraper Tasks (`src/trigger/`)
- 17 Cheerio-based independent scraper tasks (Pattern A: ~15 lines each)
- 6 Playwright-based independent scraper tasks (Pattern A + `machine: medium-1x`)
- 1 multi-venue scraper (BFI: Southbank + IMAX)
- 4 chain scraper tasks (Curzon, Picturehouse, Everyman, Odeon)
- 6 enrichment/scheduled tasks (BFI PDF, BFI Changes, Letterboxd, Festival Reverse-Tag, Festival Watchdog, Eventive)
- Daily orchestrator (`scrape-all`) with 3-wave execution pattern

### AI Verification
- `src/trigger/verification.ts` — post-scrape quality check using Gemini Flash Lite
- Checks for HTML in titles, stale dates, domain mismatches, encoding issues
- `src/trigger/verification-alerts.ts` — Telegram alerts with 2-week calibration period
- Extended `src/agents/types.ts` with 9 new `DataIssueType` values

### Gemini Multi-Model Support
- Added `GEMINI_MODELS` constant (pro + flashLite) to `src/lib/gemini.ts`
- Extended `generateText()` with optional `model`, `responseMimeType`, `responseJsonSchema` params
- Backward-compatible — existing callers unchanged

### Admin API Migration
- `src/config/feature-flags.ts` — `USE_TRIGGER_DEV` flag (`ORCHESTRATOR=trigger.dev`)
- Updated `src/app/api/admin/scrape/route.ts` — conditional dispatch
- Updated `src/app/api/admin/scrape/all/route.ts` — triggers orchestrator task

### Monitoring
- `src/trigger/on-failure.ts` — shared onFailure handler (PostHog + Telegram)
- `src/trigger/utils/telegram.ts` — Markdown-formatted alerts with severity emoji

### GH Actions
- Disabled schedule crons in `scrape.yml` and `scrape-playwright.yml`
- Kept `workflow_dispatch` for emergency manual fallback

## Impact
- **All 28 scrapers** now have a single orchestration point on Trigger.dev
- **6 previously unautomated cinemas** (Odeon venues) now included in daily runs
- **Playwright scrapers** run in proper container environments (no more Vercel serverless limitations)
- **AI verification** catches data quality issues before they reach users
- **Telegram alerts** replace silent failures — 8-week Playwright outage scenario no longer possible
- **Feature-flagged** — can instantly revert to Inngest by removing `ORCHESTRATOR` env var

## Migration Steps
1. Set `TRIGGER_SECRET_KEY` and `TRIGGER_ACCESS_TOKEN` in Vercel env vars
2. Set `ORCHESTRATOR=trigger.dev` when ready to switch
3. Deploy to trigger.dev: `npx trigger.dev@latest deploy`
4. Verify Castle + BFI tasks in Trigger.dev dashboard
5. Monitor Telegram for verification calibration results (2-week period)
