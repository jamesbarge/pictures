# Scrape accuracy audit — handoff plans 004–010

**PR**: TBD
**Date**: 2026-06-12

## Changes
- `plans/HANDOFF-2026-06-11.md` — master handoff report from the 2026-06-11 live `/scrape` run + four-way audit (TMDB matching, Letterboxd, scraper metadata, live-DB evidence)
- Plans 004–010: enrich-run + data repairs (operational), TMDB matcher signals, scraper runtime capture, Letterboxd integrity, unmatched re-match sweep, sourceId + phantom reconcile, pipeline write-resilience
- `plans/README.md` — all seven slotted into the status table with dependency notes; three Tier-3 findings recorded as to-be-planned

## Impact
- Gives any zero-context agent an executable path to fix the wrong-TMDB-match and Letterboxd-mismatch problems found in production
- Documents the 2026-06-11 double-wedge reproduction that promotes plan 001 to blocking priority
