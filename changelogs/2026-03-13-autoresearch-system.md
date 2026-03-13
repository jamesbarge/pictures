# AutoResearch — Autonomous Experimentation System

**Branch**: `chore/kaizen-2026-03-13-0741`
**Date**: 2026-03-13

## Summary

Implements an autonomous experimentation framework inspired by Karpathy's autoresearch pattern (iterate → evaluate → keep/discard). Two systems run overnight/weekly to self-improve data quality:

- **AutoScrape**: Detects broken cinema scrapers, uses Gemini AI to propose config overlay fixes (new CSS selectors, URL patterns), evaluates via Screening Yield Score, keeps improvements
- **AutoQuality**: Tunes audit pipeline thresholds one-at-a-time, evaluates via Data Quality Score (DQS), keeps improvements with safety floor enforcement

## Changes

### New files
- `src/autoresearch/types.ts` — Shared types (ExperimentResult, YieldScoreBreakdown, DqsBreakdown, OvernightSummary, safety floors)
- `src/autoresearch/experiment-log.ts` — DB logging + Telegram overnight reports
- `src/autoresearch/autoscrape/harness.ts` — AutoScrape experiment loop (detect broken → snapshot HTML → propose overlay → evaluate yield → keep/discard)
- `src/autoresearch/autoscrape/yield-scorer.ts` — Composite Screening Yield Score (0.4×screenings + 0.3×valid_time + 0.2×tmdb_match + 0.1×booking_url)
- `src/autoresearch/autoscrape/html-snapshotter.ts` — Capture/diff cinema HTML for agent context
- `src/autoresearch/autoscrape/program.md` — Agent instructions template for scraper repair
- `src/autoresearch/autoquality/harness.ts` — AutoQuality experiment loop (baseline DQS → propose threshold change → audit → evaluate → keep/discard)
- `src/autoresearch/autoquality/thresholds.json` — All tunable thresholds extracted from audit pipeline
- `src/autoresearch/autoquality/program.md` — Agent instructions for threshold optimization

### Modified files
- `src/db/schema/admin.ts` — Added `autoresearchExperiments` table + `experimentSystemEnum`
- `src/scrapers/base.ts` — Added `ConfigOverlay` interface, `loadConfigOverlay()`, `getSelector()`, `getUrl()` methods
- `src/scrapers/runner-factory.ts` — Added `runScraperForYield()` dry-run function
- `scripts/audit-and-fix-upcoming.ts` — Dodgy detection now reads thresholds from shared loader
- `.gitignore` — Added `.autoresearch/` (local snapshots/overlays)

## Architecture

| Autoresearch Concept | AutoScrape | AutoQuality |
|---|---|---|
| `prepare.py` (stable) | BaseScraper, runner-factory, validators | audit-and-fix-upcoming orchestrator |
| `train.py` (modifiable) | Config overlay JSON per cinema | thresholds.json |
| `program.md` (instructions) | Scraper repair prompt template | Threshold tuning prompt template |
| `val_bpb` (metric) | Screening Yield Score (0-100) | Data Quality Score (0-100) |

## Safety
- Auto-merge similarity never below 0.85
- TMDB confidence never below 0.6
- Max 3 new non-film patterns per experiment
- All experiments logged to DB with full before/after metrics
- Reverts automatically on metric regression

## Impact
- Reduces manual scraper maintenance (currently 30-60 min per broken scraper)
- Enables continuous data quality improvement without human intervention
- Foundation for future AutoConvert (conversion funnel optimization) when traffic justifies it
