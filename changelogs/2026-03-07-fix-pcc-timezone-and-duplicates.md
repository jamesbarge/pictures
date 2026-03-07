# Fix BST Timezone Offset & AI Hallucination Guard

**Date**: 2026-03-07
**Branch**: `fix/scraper-logs`

## Problem

1. **BST timezone offset**: Screenings during BST (March 30+) displayed 1 hour ahead on pictures.london. Root cause: scrapers constructed dates with `new Date(year, month, day)` which uses the server's local timezone (UTC on Trigger.dev). When a cinema listed "18:00" for a May screening, the scraper stored 18:00 UTC, but the actual UK time is 18:00 BST = 17:00 UTC. The browser then displayed 18:00 UTC as 19:00 BST.

2. **Duplicate "Slayer Part Two"**: Gemini AI title extractor hallucinated "Slayer" from a "Dune: Part Two" screening. "Dune" was missing from franchise pattern allowlists, so the colon-handling heuristic split it incorrectly.

## Solution

### Timezone Fix (`date-parser.ts`)
- Added `lastSundayOfMonth()`, `isUKSummerTime()`, `ukLocalToUTC()` functions
- BST detection: last Sunday of March 01:00 → last Sunday of October 01:00 (dynamic per year)
- Changed all `new Date(year, month, day)` → `new Date(Date.UTC(year, month, day))`
- Changed `combineDateAndTime()` to use `ukLocalToUTC()` instead of `.setHours()`
- Changed `parseUKLocalDateTime()` to use `ukLocalToUTC()`

### Franchise Pattern Fix
- Added `dune` to `FRANCHISE_PATTERN` in `src/lib/title-extraction/patterns.ts`
- Added `dune` to `isFilmSeries` regex in `src/scrapers/utils/film-title-cleaner.ts`
- Added `part` to `isSubtitle` regex (catches "Dune: Part Two", "Back to the Future: Part II")

### AI Hallucination Guard (`ai-extractor.ts`)
- Added `hasWordOverlap()` function that computes word overlap ratio
- After Gemini API call, rejects output with <30% word overlap → falls back to basic cleaning
- Prevents AI from returning completely unrelated titles

### Scraper Fixes (7 cinemas)
- `arthouse-crouch-end.ts`: replaced `setHours()` with `combineDateAndTime()`
- `rio.ts`: replaced `setHours()` + `new Date(dateStr)` with UTC parsing + `combineDateAndTime()`
- `garden.ts`: replaced `new Date(dateStr)` + `setHours()` with UTC parsing + `combineDateAndTime()`
- `phoenix.ts`: replaced `setHours()` with `combineDateAndTime()`
- `olympic.ts`: replaced `setHours()` with `combineDateAndTime()`
- `david-lean.ts`: replaced `setHours()` with `combineDateAndTime()`
- `romford-lumiere.ts`: replaced `setHours()` + `new Date(2026, 3, 30)` with UTC + `combineDateAndTime()`

### Data Cleanup Script
- `scripts/fix-pcc-time-and-dupes.ts`: Merges "Slayer Part Two" into "Dune: Part Two", fixes BST-affected PCC screening times. Supports `--dry-run`.

## Files Changed
- `src/scrapers/utils/date-parser.ts` — core timezone fix
- `src/scrapers/utils/date-parser.test.ts` — updated to UTC getters, added BST tests
- `src/lib/title-extraction/patterns.ts` — franchise pattern
- `src/scrapers/utils/film-title-cleaner.ts` — colon heuristic
- `src/lib/title-extraction/ai-extractor.ts` — hallucination guard
- `src/lib/title-extraction/ai-extractor.test.ts` — hallucination + Dune tests
- `src/lib/title-extraction/index.ts` — export hasWordOverlap
- 7 cinema scraper files
- `scripts/fix-pcc-time-and-dupes.ts` — data cleanup
