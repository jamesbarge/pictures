# Letterboxd Enrichment Coverage Improvements

**PR**: #64
**Date**: 2026-02-02

## Changes
- Added `isLikelyEvent()` filter to skip titles containing event keywords (q&a, preview, quiz, workshop, marathon, ceremony, screening, party, tasting, conversation, discussion, intro, talk, forum, live broadcast, season, trilogy, series)
- Added `extractFilmTitle()` fallback that extracts clean film names from colon-separated or "+" separated titles (e.g., "BFI Classics: Vertigo" → "Vertigo")
- Added `contentType = 'film'` filter to both DB queries so non-film content (events, shorts, etc.) is excluded
- Fixed auto-run side effect: the module previously executed enrichment on import; now only runs when called directly via CLI

## Impact
- More films with upcoming screenings will get Letterboxd ratings
- Fewer wasted HTTP requests to Letterboxd (events and non-films skipped)
- The module can now be safely imported by other code (cron handlers, API routes) without triggering a full enrichment run
