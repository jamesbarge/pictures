# Enrichment Pipeline Improvements

**PR**: #TBD
**Date**: 2026-03-12

## Changes

### Post-Scrape Enrichment Trigger (B2)
- New `enrichment-post-scrape` Trigger.dev task fires after each scraper run that adds screenings
- Queries all unenriched films at the scraped cinema (missing TMDB ID) with upcoming screenings
- Tries title variation strategy (7 generators) against TMDB with 250ms spacing
- Intelligent backoff: skip films with 3+ failed attempts in 7 days, skip if last attempt < 24h ago
- Records enrichment attempts in `enrichmentStatus` JSONB column for tracking

### Daily Enrichment Sweep (B3 + B5)
- New `enrichment-daily-sweep` scheduled task at 4:30am UTC daily (skip Mondays)
- 4-phase pipeline:
  1. TMDB matching — films with no tmdbId, uses title variations
  2. TMDB backfill — films with tmdbId but missing poster/cast/synopsis
  3. Letterboxd ratings — reuses existing `enrichLetterboxdRatings()` function
  4. Poster sourcing — films still missing posters after TMDB, uses poster service fallback chain
- 30-minute time budget with early exit
- Telegram summary with stats on completion

### Title Variation Strategy (B4)
- New `src/lib/enrichment/title-variations.ts` module
- Generates 7 search variations from raw title: original, cleanFilmTitle(), strip after "+", after-colon, before-colon, strip year parenthetical, The prefix toggle
- `extractYearFromTitle()` helper for year hints (filters BBFC ratings like (12), (15))

### Enrichment Status Schema (B1)
- Added `enrichmentStatus` JSONB column to films table
- Tracks per-enrichment-type attempts: tmdbMatch, tmdbBackfill, letterboxd, poster, metadata
- Each attempt records lastAttempt, attempts count, success, failureReason

### Title Metadata & Picturehouse Dedup (A4 + A5)
- `cleanFilmTitleWithMetadata()` returns `{ cleanedTitle, strippedPrefix, strippedSuffix }`
- `cleanFilmTitle()` remains as backward-compatible wrapper
- Picturehouse `deduplicateShowtimes()` groups by datetime+screen, keeps shorter title

### Scraper Title & Classification Fixes (A1 + A2 + A3)
- 8 new EVENT_PREFIXES for community screening series
- Suffix stripping: pagination, "on 35mm/70mm", complex Q&A, duration-prefixed events
- BFI: clean pagination titles instead of rejecting
- Expanded quickClassify() with event, live broadcast, concert patterns

## Impact
- Films get enriched within hours of being scraped, not up to 7 days later
- Title variations increase TMDB match rate for event-wrapped titles
- Intelligent backoff prevents wasting API calls on consistently unmatched films
- Daily sweep catches anything missed by post-scrape trigger
- All existing functionality preserved — backward-compatible changes only
