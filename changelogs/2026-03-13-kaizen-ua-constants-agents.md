# Kaizen — Consolidate UA Strings in Fallback Enrichment

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Replaced 2 hardcoded User-Agent strings in `src/agents/fallback-enrichment/letterboxd.ts` with `CHROME_USER_AGENT` from `@/scrapers/constants`
- Both `fetchLetterboxdRating()` and `fetchLetterboxdPoster()` now use the shared constant

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: extract-constant
