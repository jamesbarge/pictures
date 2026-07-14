# Schedule L-CUT gap-fill + scraper-regression parity monitor (Coverage Phase 1)

**PR**: TBD
**Date**: 2026-07-14
**Plan**: `docs/plans/2026-07-13-coverage-implementation-plan.md` (Phase 1)

## Summary

Turns the one-off `scripts/lcut-gapfill.ts` (shipped as a manual pass in #724) into a
weekly-scheduled gap-fill source **and** a scraper-regression detector, wired into the
`/scrape` orchestrator.

## Context: there is no scheduler in this repo

The plan called for "schedule the gap-fill weekly." Investigation confirmed every scheduler
this project ever had (Trigger.dev, Bree+PM2, Inngest, Vercel cron, GitHub Actions cron) was
deliberately removed between 2026-04-27 and 2026-05-07 under the documented policy "nothing
scheduled should run off this Mac." The weekly scrape is the user manually invoking the
`/scrape` slash command (`npm run scrape:unified` → `src/scripts/run-scrape-and-enrich.ts`).

So "weekly, after the main scrape wave" is implemented as a **new phase inside that
orchestrator** — no cron reintroduced. This guarantees ordering (it runs after
`runScrapeAll()` completes) and runs at the user's existing weekly cadence.

## Changes

### `scripts/lcut-gapfill.ts` — refactor to a reusable core
- Extracted the fetch → diff → report → (optional) execute logic into an importable
  `runLcutGapfill(opts)` returning a structured `LcutGapfillReport` (per-venue parity:
  `{ venue, total, covered, missing, missingRows, inserted, failed, blocked }`).
- Injectable `fetchListings` / `loadExisting` seams so the whole pipeline is unit-testable
  with no DB or network.
- `executeTargets?: Set<string>` — when set, only those cinema ids are inserted; parity is
  still computed for **every** venue.
- New pure helpers: `classifyLcutTargets(scrapedIds)`, `detectLcutRegressions(report,
  scrapedIds, threshold)`, `formatParityTable(report)`, `getLcutTargetCinemaIds()`.
- CLI is now a thin wrapper — behavior-preserving. Added `--targets id1,id2` to narrow the
  execute set for supervised runs.

### `src/scrapers/registry.ts` — `getScrapedCinemaIds()`
- Returns every cinema id covered by a registered (non-enrichment) scraper. Used to classify
  L-CUT venues into source-only vs scraped **at runtime**, so a venue auto-reclassifies when
  it gains a first-party scraper (e.g. `the-arzner` in Phase 2b).

### `src/scripts/run-scrape-and-enrich.ts` — Phase 1b
- New phase after the scrape, before `cleanup:upcoming`:
  - Insert missing screenings for **source-only** venues (Arzner, Horse Hospital, Good
    Shepherd, Project Loop).
  - **Report-only** for scraped venues; >5 missing vs L-CUT → warn-level Telegram via the
    same `sendTelegramAlert` path `scrape-all.ts` uses (quiet on clean weeks).
- Skipped under `--skip-scrape` (parity needs a fresh scrape) or explicit `--skip-lcut`.

### `package.json`
- `lcut:gapfill` script for manual/supervised runs.

### Docs
- `SCRAPING_PLAYBOOK.md`: L-CUT section updated (now scheduled; source-only vs scraped rule).
- `.claude/commands/scrape.md`: documents Phase 1b.

## Design decision (confirmed with James)

Scraped venues are **report-only** in the scheduled path — we do NOT auto-insert L-CUT rows
for a venue we scrape ourselves. Auto-inserting would drive the "missing" count to ~0 and
blind the regression detector to the exact silent-drop it exists to catch. Gaps at scraped
venues are fixed at the scraper (Phase 3), with the weekly parity report keeping the pressure
on. The supervised CLI still fills all venues by default (use `--targets` to narrow).

## Verification

- `scripts/lcut-gapfill.test.ts` extended: `classifyLcutTargets`, `detectLcutRegressions`,
  and a `runLcutGapfill` executeTargets-filtering test (DB-free via injected seams).
- Local vitest/tsc wedge on this machine (fork/thread worker start times out at 60s — known
  issue); verified the core logic via a standalone `tsx` smoke test (15/15 checks) covering
  the real registry classification (exactly the 4 expected source-only venues), the parity
  diff (missing counts, early-hour skip, sort order), and the regression detector.
- eslint clean on all changed files.
- CI is the authoritative gate for the full test suite + `tsc`.

## Impact

- Weekly `/scrape` now keeps low-volume source-only venues fresh automatically.
- Silent scraper regressions at venues L-CUT also covers (e.g. the ICA 50-film cap, a Phase 3
  target) now surface as a warn-level Telegram signal — previously invisible without a
  per-cinema baseline.
- No behavior change for the manual CLI; no new dependencies; no cron.
