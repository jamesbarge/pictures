# Fix Scraper Timeout Durations

**Date**: 2026-03-15

## Changes
- Increased Picturehouse chain `maxDuration` from 1800s (30 min) to 3600s (60 min) — the largest chain (11 venues, 2600+ screenings) was hitting the ceiling during the post-scrape pipeline phase (AI classification, TMDB matching, DB writes)
- Added `maxDuration: 600` (10 min) to 17 Cheerio-based independent scrapers that had no explicit duration set (Nickel, Castle, Castle Sidcup, Rio, Prince Charles, ICA, Genesis, Peckhamplex, Garden, Close-Up, Cine Lumiere, ArtHouse, Coldharbour Blue, Olympic, David Lean, Riverside, Romford Lumiere)
- Changed `retry.maxAttempts` from 3 to 0 for all 17 independent scrapers — consistent with orchestrator-managed tasks where retrying a timed-out task wastes budget

## Impact
- Fixes Picturehouse MAX_DURATION_EXCEEDED timeout observed in 2026-03-15 orchestrator run
- Fixes Nickel MAX_DURATION_EXCEEDED timeout (platform default ~300s was too low for post-scrape pipeline)
- Prevents future timeout surprises from the remaining 15 scrapers that were also missing explicit durations
- No functional changes to scraping logic
