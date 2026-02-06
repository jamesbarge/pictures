# Fix Film Data Quality - Festival Titles and Missing Posters

**Date**: 2026-01-31

## Problem
The frontend was displaying films with improper titles like "ANZ FILM FESTIVAL: WE BURY THE DEAD" instead of just "We Bury The Dead". Many films were missing posters and TMDB metadata due to:

1. Festival/event prefixes not being stripped during scraping
2. Missing event patterns in title extractor
3. Films with prefixes creating duplicate records instead of matching to canonical films
4. No regular data quality monitoring

## Changes

### 1. Added Missing Festival Patterns
Updated three files to recognize festival prefixes:
- `src/lib/title-patterns.ts`
- `src/agents/enrichment/title-extractor.ts`
- `src/db/backfill-posters.ts`

New patterns added:
- `ANZ Film Festival` / `ANZ FILM FESTIVAL`
- `LSFF` / `London Short Film Festival`
- `Iris LGBTQ+ Film Festival`

### 2. Created Festival Film Fix Script
`src/scripts/fix-festival-films.ts`
- Finds all films with festival prefixes
- Cleans titles by stripping prefixes
- Attempts TMDB matching with cleaned titles
- Merges duplicates when TMDB IDs match

### 3. Created Data Quality Analysis Script
`src/scripts/analyze-film-data-quality.ts`
- Comprehensive diagnostic tool for ongoing monitoring
- Identifies films missing posters, TMDB IDs, years
- Detects problematic titles needing cleaning
- Finds misclassified live broadcasts
- Reports potential duplicates

### 4. Ran Backfill Process
Executed `npm run db:backfill-posters` to:
- Process 254 films missing posters
- Match 39 films to TMDB
- Find and merge 11 duplicates
- Add 40 new posters

## Results

### Before
- 1091 total films
- 254 missing posters (23.3%)
- 569 without TMDB ID (52.2%)
- 35 problematic titles
- 10 misclassified live broadcasts

### After
- 1080 total films (11 duplicates merged)
- 214 missing posters (19.8%) - **40 added**
- 526 without TMDB ID (48.7%) - **43 matched**
- 17 problematic titles - **18 cleaned**
- 9 misclassified live broadcasts

## Specific Films Fixed

### ANZ Film Festival
- `ANZ Film Festival: Kangaroo` → `Kangaroo` (TMDB matched, poster added)
- `ANZ FILM FESTIVAL: HEAD SOUTH` → `Head South` (already existed, now linked)
- `ANZ FILM FESTIVAL: PIKE RIVER` → `Pike River` (already existed, now linked)
- `ANZ FILM FESTIVAL: WE BURY THE DEAD` → `We Bury the Dead` (already existed with poster)
- `ANZ FILM FESTIVAL: SHORT FILM SHOWCASE` (festival compilation, skipped)
- `ANZ Film Festival: KOKA` → `Koka` (already existed, now linked)

### London Short Film Festival (LSFF)
- `LSFF: Express Yourself` → `Express Yourself` (TMDB matched)
- `LSFF: Midnight Movies` → `Midnight Movies: From the Margin to the Mainstream` (TMDB matched)
- `LSFF: WTF?!` → `WTF?!`
- `LSFF: Eye to Eye` → `Eye to Eye`
- Plus 6 more LSFF documentary programs

### Other Festivals
- `London Short Film Festival Showcase: Palestine Looks Back` → `Palestine Looks Back`
- `Iris LGBTQ+ Film Festival On the Move: Best Bits + Q&A` → `Best Bits + Q&A`

## Remaining Work

17 films still need attention:

**Live Broadcasts** (should be contentType = "live_broadcast"):
- Met Opera Live: Tristan and Isolde (2026)
- National Theatre Live series (6 films)
- NT Live: The Audience

**Event Series** (should strip prefix):
- The Liberated Film Club (2 films)
- Saturday Morning Picture Club: The Princess and The Frog
- Drink & Dine events (5 films)
- Kids Club: The Wild Robot

**Double Bills:**
- Black History Studies: Afeni Shakur and the Trial of the Black Panther 21 + Liberty Double Bill

## Verification

To verify the fixes work:
1. Search for "We Bury The Dead" - should show without "ANZ FILM FESTIVAL:" prefix
2. Search for "Kangaroo" - should have poster and correct 2025 NZ film data
3. Search for "Head South", "Pike River", "Koka" - all should have posters
4. Search for "ANZ Film Festival" - should return no results (all cleaned)

## Co-Authored-By
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
