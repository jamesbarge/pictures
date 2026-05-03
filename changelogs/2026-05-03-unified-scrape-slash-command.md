# Unified `/scrape` slash command — Phase 1 MVP

**PR**: TBD
**Date**: 2026-05-03
**Branch**: `feat/unified-scrape-slash-command`
**Driven by**: 8-stream research project documented in `Pictures/Research/scraping-rethink-2026-05/`. The synthesis (`SYNTHESIS.md`) recommends a 3-phase rollout; this PR is Phase 1 only.

## Why

The user runs cinema scraping weekly and wants one slash command that scrapes all 26 scrapers, enriches the results, and surfaces silent-breakers — with no cron required. The existing pipeline forced them to run four separate commands in sequence (`scrape:all`, `cleanup:upcoming`, `audit:films`, plus a manual scan of `scraper_runs` for zero-count successes), and the Bree+PM2 scheduler shipped in PR #469 doesn't match their actual workflow.

Eight parallel research streams confirmed:
- The existing `runScrapeAll()` orchestrator is good — fan-out + concurrency caps + failure isolation already work
- The 4-script enrichment pipeline can be wrapped, doesn't need rebuilding
- Silent-breaker detection (Prowlarr's `IndexerStatusService` pattern) is the highest-leverage missing primitive — directly fixes the BFI IMAX 2026-04-27/28 silent-success regression
- £0 marginal cost given the user runs everything within their Claude Code subscription

## Changes

### New files

- **`src/lib/scrape-quarantine.ts`** — Silent-breaker detection. Reads the last N runs per cinema and flags any whose most-recent consecutive runs are all `status=success && screening_count=0`. Read-only. Default threshold=2, lookback=5.
- **`src/scripts/run-scrape-and-enrich.ts`** — Orchestrator. Calls `runScrapeAll()` in-process, then spawns `cleanup:upcoming` and `audit:films` as child processes (failure isolation), then runs the silent-breaker detection. Streams output to the parent. Final summary reports per-phase ✓/✗, durations, and quarantined cinemas.
- **`changelogs/2026-05-03-unified-scrape-slash-command.md`** — this file.

### Modified files

- **`.claude/commands/scrape.md`** — completely rewritten. Was a single-cinema manual testing helper; is now the unified scrape+enrich entry point with `health` / `enrich` / `scrape` arg variants.
- **`package.json`** — added `scrape:unified` npm script.
- **`RECENT_CHANGES.md`** — entry at top.

### Renamed files

- **`.claude/commands/scrape-one.md`** ← was `.claude/commands/scrape.md`. Single-cinema flow preserved verbatim.

### Verification

- `npm run lint` — 0 errors, 40 warnings (all pre-existing in unrelated files)
- `npx tsc --noEmit` — clean
- `npm run test:run` — 923/923 passing
- Smoke test: `detectSilentBreakers()` against live DB returned 0 quarantined cinemas (correct — BFI IMAX recovered 2026-04-29). Behavioural contract: "currently silent", not "ever been silent". Verified by inspecting `scraper_runs` for `bfi-imax`: most recent 4 runs all `success` with 12 screenings each.

## Impact

### Who/what this affects

- **The user**: their weekly scrape workflow collapses from 4 commands + manual zero-count scan to one slash command. The `/scrape-one <slug>` workflow remains unchanged for single-cinema iteration.
- **The Bree+PM2 scheduler**: still works, still scheduled at 03:00 UTC. Phase 2 of the rebuild may retire it; Phase 1 leaves it intact as a safety net.
- **The data-quality patrol logs**: silent-breaker cases like the BFI IMAX 2026-04-27/28 regression should now surface in the `/scrape` final report instead of going unnoticed for two days.

### What this does NOT change (deferred to Phase 2 / Phase 3)

- **Patchright migration**: rebrowser-playwright + StealthPlugin remains. Stream 3 found Picturehouse + Everyman aren't anti-bot problems at all (pure REST APIs); only Curzon needs the Patchright swap (~2-hour task).
- **bge-m3 embedding-based dedup**: enrichment still uses the existing trigram + DeepSeek-V4-Flash matching path. Stream 6 designed the bge-m3 pipeline + 119-fixture regression set; that's Phase 3.
- **AutoScrape retirement**: Stream 7 found AutoScrape never produced any output (zero artefacts in Obsidian). Phase 2 deletes the harness; Phase 1 leaves it dormant.
- **Append-only `enrichment_corrections` PG table**: replaces self-modifying `.claude/data-check-learnings.json`. Phase 3.
- **`/scrape resume`**: separate per-cinema retry mode. Phase 1 partial-failure resume = re-run `/scrape enrich` to skip the scrape phase.

## Related research artefacts

- `Pictures/Research/scraping-rethink-2026-05/07-internal-archaeology.md` — failure-mode taxonomy (29 entries) that briefed every other stream
- `Pictures/Research/scraping-rethink-2026-05/SYNTHESIS.md` — single architecture recommendation, 5 critical bets, decision-criteria gate
- `Pictures/Research/scraping-rethink-2026-05/01-08-*.md` — 7 supporting research reports
