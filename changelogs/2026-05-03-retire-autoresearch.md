# Retire AutoScrape and AutoQuality harnesses

**PR**: TBD
**Date**: 2026-05-03
**Branch**: `feat/unified-scrape-slash-command`

## Why

Stream 7 of the scraping rethink research surfaced two findings that justify retirement:

1. **AutoScrape is theatre.** The `Pictures/AutoResearch/AutoScrape/` directory in Obsidian (where the harness was supposed to write its repair reports) does not exist. Zero outputs have ever been produced. BFI IMAX hit a textbook silent-breaker (success status, 0 screenings, 2 consecutive nights) on 2026-04-27/28 — the exact case the harness was built to detect — and AutoScrape produced nothing. The new Prowlarr-style health-state-machine in `src/lib/scrape-quarantine.ts` (shipped in the previous commit) does this work explicitly.

2. **AutoQuality plateaued.** The Baseline DQS report (the only artifact in `Pictures/AutoResearch/AutoQuality/`) shows 30 experiments across 3 runs producing no DQS movement (90.0 → 90.3 was floating-point artifact). The report's own conclusion: "Biggest remaining lever is direct enrichment via Claude Code scripts." Direct enrichment is now the model.

Sunk-cost recovery (per Stream 8): ~$11/month (£8.70) in Gemini 3.1 Pro API calls eliminated. This is the entire externally-payable AI budget for the project.

## Changes

### Deleted

- **`src/autoresearch/`** entirely (16 files):
  - `autoscrape/{harness,html-snapshotter,scraper-registry,yield-scorer,program.md}.ts`
  - `autoquality/{harness,dqs-snapshots,db-thresholds,audit-wrapper,spot-checks,program.md}.ts`
  - `experiment-log.ts`, `obsidian-reporter.ts`, `types.ts`
- **`.claude/commands/autoscrape.md`** (local-only)
- **`.claude/commands/autoquality.md`** (local-only)

### Relocated

The thresholds config + loader were the only live AutoQuality artifacts (consumed by `tmdb/match.ts`, `lib/jobs/daily-sweep.ts`, `lib/jobs/post-scrape.ts`, `scripts/cleanup-duplicate-films.ts`).

- **Moved** `src/autoresearch/autoquality/thresholds.json` → `src/lib/data-quality/thresholds.json`
- **Rewritten** `src/autoresearch/autoquality/load-thresholds.ts` → `src/lib/data-quality/load-thresholds.ts`
  - Removed: DB-first loading, in-process cache mutation, `setCachedThresholds()`, `reloadThresholds()`, AutoQuality DB fallback path
  - Kept: `loadThresholds()` and `loadThresholdsAsync()` as thin readers of the bundled JSON
  - Added: comment that explains thresholds are now static (edit JSON, commit it)
- **Updated** 4 importers to the new path

### Modified

- `src/lib/tmdb/match.ts` — import path
- `src/lib/jobs/daily-sweep.ts` — import path
- `src/lib/jobs/post-scrape.ts` — import path
- `scripts/cleanup-duplicate-films.ts` — import path

## Verification

- `npx tsc --noEmit` — clean
- `npm run test:run` — 918/918 passing
- All 3 production-pipeline consumers still compile and pass tests after the relocation

## What's no longer possible (intentional)

- AutoScrape's "Gemini-proposes-CSS-overlay" self-repair experiments
- AutoQuality's threshold tuning experiments
- Reading thresholds from the `autoresearch_config` DB row (the table can stay; nothing reads from it now)

If you want to adjust a threshold, edit `src/lib/data-quality/thresholds.json` directly and commit.

## Why not just delete `thresholds.json` too

Considered. The data-quality pipeline (`tmdb/match.ts`'s confidence math, `cleanup-duplicate-films.ts`'s trigram similarity, `audit-film-data.ts`'s dodgy detection) genuinely needs these constants, and externalizing them in one place is cleaner than scattering 12 magic numbers across the codebase. The retirement is of the experiment harness, not the configuration.
