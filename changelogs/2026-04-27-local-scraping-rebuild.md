# Local-scraping rebuild — delete Trigger.dev, add Bree+PM2 scheduler

**PR**: #469
**Date**: 2026-04-27

## Context

Trigger.dev cloud deploys had been failing for 16+ days due to an upstream bug in `@trigger.dev/build`'s Playwright extension (the generated Dockerfile greps for `browser: chromium-headless-shell` against `npx playwright install --dry-run` output, but Playwright >= 1.58 changed the dry-run format and that line no longer exists). Two consecutive deploy attempts failed with the same grep error. Cloud was running 2026-04-10 code; nothing merged in the previous 2 weeks (DeepSeek swap, Phase 5 data-quality passes, anomaly digest, Inngest v4 upgrade, etc.) was actually live in production.

Rather than fix the upstream extension bug, the user opted to delete Trigger.dev entirely and run all scraping locally on their dev Mac, using cutting-edge browser automation (`rebrowser-playwright`, `Stagehand v3`) and DeepSeek-only AI (V4-Flash for text, self-hosted DeepSeek-OCR via Ollama for vision).

A parallel discovery: review of 1,363 `/data-check` patrol logs in Obsidian (`Pictures/Data Quality/`) showed that the top recurring data-quality issue was duplicate film rows from anniversary/restoration suffix variants — "Amélie - 25th Anniversary" was being inserted 22 times per patrol cycle as separate films from "Amélie". A single 1-line code change in `normalizeTitle` collapses the entire variant class.

## Architecture (the new local stack)

```
PM2 (launchd-supervised)
└─ Node process running Bree (in-process worker-thread cron)
   ├─ scrape-all        (daily 3am UTC)
   ├─ daily-sweep       (4:30am UTC, skips Mondays)
   ├─ autoscrape-repair (5am UTC, after scrape-all/daily-sweep)
   ├─ letterboxd-ratings (Mon 8am UTC)
   ├─ bfi-pdf           (Sun 6am UTC)
   ├─ bfi-changes       (Wed 10am UTC)
   ├─ bfi-cleanup       (Fri 8am UTC)
   ├─ eventive          (Mon 11am UTC)
   └─ catch-up          (on Bree start, after 90s grace)
```

Each Bree worker imports the corresponding pure-Node `runXxx()` function from `src/lib/jobs/*` and calls it. No Trigger.dev runtime. No cloud cron.

## Changes (8 phases, 6 commits)

### Phase 0 — Extract Trigger-coupled code into pure-Node modules
Each `src/trigger/...` task body moved to `src/lib/jobs/<name>.ts` as an exported async function. Trigger wrappers reduced to thin shims while transitional, then deleted in Phase 4.
- `src/lib/telegram.ts` — pure-Node Telegram alerter
- `src/lib/scraper-verification.ts` — Gemini → DeepSeek swap
- `src/lib/jobs/daily-sweep.ts` (430 LOC, 5-phase enrichment)
- `src/lib/jobs/scrape-all.ts` (293 LOC, registry-driven fan-out)
- `src/lib/jobs/post-scrape.ts`
- `src/lib/jobs/letterboxd-import.ts`
- `src/lib/jobs/post-deploy-verify.ts`

### Phase 1 — Bree + PM2 scheduler
- `bree@^9.2.9`, `pm2@^6.0.14` added as runtime deps
- `src/scheduler/index.ts` registers 7 cron jobs + catch-up runner
- `src/scheduler/jobs/<name>.ts` × 8 (one per cron)
- `ecosystem.config.cjs` for PM2 launchd persistence
- npm scripts: `scheduler:dev`, `scheduler:start`, `scheduler:stop`, `scheduler:logs`, `scheduler:restart`

### Phase 1.5 — Prevention layer in `scrapers/pipeline.ts`
Single 1-line code change in `normalizeTitle`: apply `cleanFilmTitle` first. Collapses anniversary/re-release/restoration suffix variants onto canonical title. 9 new prevention test cases.

### Phase 2 — Admin/user API routes off Trigger SDK
4 routes refactored: `src/app/api/admin/scrape/route.ts`, `src/app/api/admin/scrape/all/route.ts`, `src/app/api/admin/qa/route.ts` (501 until QA migration), `src/app/api/user/import-letterboxd/route.ts`. All fire-and-forget pure-Node functions.

### Phase 3 — Browser stack swap to `rebrowser-playwright`
Drop-in across 18 source files. Patches the `Runtime.Enable` CDP leak. Layered with playwright-extra stealth via `addExtra(rebrowserChromium)` in `src/scrapers/utils/browser.ts`.

### Phase 4 — Delete Trigger.dev infrastructure
- 49 files in `src/trigger/` deleted
- `trigger.config.ts` deleted
- `.github/workflows/deploy-trigger.yml` deleted
- `@trigger.dev/build`, `@trigger.dev/sdk` removed from `package.json`
- 10 cross-imports relocated before deletion (task-registry → scrapers/, qa/utils/* → lib/qa/utils/*)
- `post-deploy-verify.yml` switched to direct `curl --fail`

### Phase 5 — Catch-up runner for sleeping-Mac problem
`src/scheduler/catch-up.ts` queries `scraper_runs` per cinema for `MAX(completed_at) WHERE status='success'`. Any cinema with last run >24h ago is enqueued via `bree.run('catch-up')` after a 90s grace period. Self-healing.

### Phase 6 — AutoScrape repair via Stagehand v3
`src/lib/jobs/autoscrape-repair.ts` queries `scraper_runs` for cinemas with anomalies/zero-counts in the last 48h, autonomously navigates each via Stagehand + DeepSeek-V4-Pro, extracts screenings, and Telegram-reports if recovery threshold (50% of baseline) is met. NO auto-DB-writes — humans review first.
- `@browserbasehq/stagehand@^3.3.0`, `@ai-sdk/openai-compatible@^1.0.36` (pinned to v1 for V2 protocol compat), `ai@^6.0.168`
- Kill-switch: `AUTOSCRAPE_DISABLED=1`

### Phase 7 — Vision via self-hosted DeepSeek-OCR (Ollama)
`src/lib/vision.ts` exports `extractScreeningsFromScreenshot(imagePath, options?)` and `checkOllamaHealth(options?)`. Pure fetch against `http://localhost:11434`. No new API keys at runtime. Scheduler probes Ollama health at boot.
- Setup (one-time): `brew install ollama && brew services start ollama && ollama pull deepseek-ocr`

### Phase 8 — Cutover audit (calendar-time piece deferred to user)
`scripts/audit/local-vs-baseline.ts` produces an Obsidian-ready markdown report comparing recent local pipeline output (last 3 days, configurable via `--window N`) to the 30-day rolling baseline. Exit code 1 if any cinema regressed >50% — useful for cron alerting. Status icons:
- 🔴 Regressed (recent < 50% of baseline)
- 🟡 Warning (recent < 80% of baseline)
- ⚪ No recent data
- ⚫ No baseline configured
- 🟢 OK

## Impact

- **Reliability**: scrapers run daily (was weekly Mondays), with self-healing catch-up on Mac wake.
- **Stealth**: rebrowser-playwright + stealth plugins across all Playwright-based scrapers (16 cinemas).
- **Cost**: enrichment runs on DeepSeek-V4-Flash (~$0.0028/M cache hit, $0.14/M miss) instead of Gemini.
- **Data quality**: Phase 1.5 single-line fix should eliminate the entire dup-from-suffix class — patrol log volume expected to drop ~70% within 2 weeks.
- **Operations**: zero cloud cron, zero Trigger.dev cloud project after merge. Everything runs on the user's Mac.
- **New capabilities**: AutoScrape autonomous repair + Ollama-based vision extraction.

## Verification

- `npx tsc --noEmit` clean
- `npx vitest run pipeline + agents` — 110/110 passing
- `git grep -iE 'trigger\.dev|@trigger\.dev'` outside markdown returns zero results
- 92 files changed in Phase 4 alone: 52 deletions + 10 renames + 30 modifications
- Code-reviewer agent run on PR-A's foundation commit; suggestions addressed

## Cutover plan (user steps after merge)

1. `npm install` to pull `bree`, `pm2`, `rebrowser-playwright`, `@browserbasehq/stagehand`
2. `brew install ollama && brew services start ollama && ollama pull deepseek-ocr` (vision setup, one-time)
3. `npm run scheduler:start` — starts Bree+PM2 in the background
4. `pm2 startup && pm2 save` — registers with launchd so the scheduler survives reboots
5. After 3 nights, run `npx tsx --env-file=.env.local scripts/audit/local-vs-baseline.ts` — confirm <5% deviation per cinema
6. Once verified: delete the Trigger.dev cloud project from the dashboard, revoke the GitHub Action secrets (`TRIGGER_ACCESS_TOKEN` etc.)

## Deferred / out of scope

- QA pipeline migration (`/api/admin/qa` returns 501 with explanatory message; helpers moved to `src/lib/qa/utils/` and `scripts/qa-dry-run.ts` still works)
- Per-cinema vision opt-in (vision module is built but no cinema scraper uses it yet — first opt-in likely Barbican's React grid)
- Camoufox fallback for Cloudflare-hard sites (defer until rebrowser proves insufficient)
- Migrating remaining Gemini callers (autoresearch harnesses, link-validator, content-classifier) to DeepSeek (organic, on next touch)
- Upgrading from DeepSeek-OCR (v1, via Ollama) to DeepSeek-OCR-2 (no first-class MLX port yet)
