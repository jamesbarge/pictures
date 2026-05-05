# Remove Bree+PM2 scheduler

**PR**: TBD
**Date**: 2026-05-03
**Branch**: `feat/unified-scrape-slash-command`

## Why

Per `Pictures/Research/scraping-rethink-2026-05/SYNTHESIS.md`, the user runs scraping weekly via the new `/scrape` slash command. The Bree+PM2 daily-cron-at-03:00-UTC scheduler shipped in PR #469 doesn't match that workflow. Stream 7's failure-mode taxonomy also identified the scheduler as a source of operational drift (FM-16 process leaks, FM-18 cinemas-never-running) that the slash command's resume + quarantine model addresses more cleanly.

## Changes

### Deleted

- **`src/scheduler/`** (12 files) — Bree worker-thread supervisor, all 7 cron jobs, catch-up runner, tests
- **`ecosystem.config.cjs`** — PM2 config
- **`bree` and `pm2` npm dependencies**
- **5 npm scripts**: `scheduler:dev`, `scheduler:start`, `scheduler:stop`, `scheduler:logs`, `scheduler:restart`

### Modified

- **`package.json`** — dropped scheduler scripts + bree/pm2 deps
- **`.claude/commands/scrape-one.md`** (local-only) — removed mentions of the scheduler

## Impact

- **The user** no longer needs to keep PM2 running. The slash command is the only entry point.
- **The 7 cron jobs** that lived in the scheduler (scrape-all, daily-sweep, letterboxd-ratings, bfi-pdf, bfi-changes, bfi-cleanup, eventive, autoscrape-repair) are not preserved as separate flows. Their work is rolled into `/scrape` (scrape-all + Letterboxd happen inside `runScrapeAll`; daily-sweep is the existing `cleanup:upcoming` + `audit:films`; AutoScrape is being retired in the next commit; BFI PDF jobs and Eventive remain available as standalone npm scripts (`scrape:bfi-pdf`, etc.) for ad-hoc use).
- **`package-lock.json`** is intentionally not synced in this commit — npm install was hanging in the sandbox. Run `npm install` locally to update the lockfile; expected diff is removal of `node_modules/bree`, `node_modules/pm2`, and their transitive dependencies.

## Verification

- `npx tsc --noEmit` — clean
- `npm run test:run` — 918/918 passing (down from 923; the 5 deleted tests were `src/scheduler/catch-up.test.ts` which is now gone)
- `grep -rn "@/scheduler\|src/scheduler\|bree\|pm2"` in src/ returns only historical changelog entries (correctly preserved as the historical record)
