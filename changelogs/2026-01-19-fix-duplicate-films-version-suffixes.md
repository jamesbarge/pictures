# Fix Duplicate Films from Version Suffixes

**PR**: #51
**Date**: 2026-01-19

## Problem

Films like "Apocalypse Now : Final Cut" and "Apocalypse Now" were being treated as separate films because the title normalization didn't strip version suffixes. This caused:
- Duplicate film records in the database
- Same screening appearing under two different films
- Confusion in search results and watchlist

## Root Cause

The `normalizeTitle()` function removed punctuation but kept all words, so:
- `"Apocalypse Now : Final Cut"` → `"apocalypse now final cut"`
- `"Apocalypse Now"` → `"apocalypse now"`

These different normalized strings caused cache misses and duplicate film creation.

## Changes

### src/lib/title-extractor.ts
- Added `canonicalTitle` and `version` fields to `ExtractionResult` interface
- Added `VERSION_SUFFIX_PATTERNS` array to detect version suffixes:
  - Colon-separated: `: Final Cut`, `: Director's Cut`, `: Redux`, `: Extended Edition`
  - Hyphen-separated: `- Director's Cut`, `- Final Cut`
- Added `extractVersionSuffix()` function to extract base title and version
- Added `hasVersionSuffix()` function for quick detection
- Updated `isLikelyCleanTitle()` to recognize version suffixes as clean titles
- Updated AI prompt to ask for canonical titles when extraction is needed

### src/scrapers/pipeline.ts
- Updated screening grouping to use `canonicalTitle` instead of `filmTitle`
- Updated `getOrCreateFilm()` to use canonical title for cache lookups
- Updated similarity search and TMDB matching to use canonical title
- Film records now store the canonical title (version is a screening attribute)

### src/lib/title-extractor.test.ts
- Added 21 new test cases for canonical title extraction
- Tests verify version suffix stripping works correctly
- Tests verify legitimate subtitles are preserved

## Examples

| Input | Display Title | Canonical Title | Version |
|-------|---------------|-----------------|---------|
| Apocalypse Now : Final Cut | Apocalypse Now : Final Cut | Apocalypse Now | Final Cut |
| Blade Runner : The Final Cut | Blade Runner : The Final Cut | Blade Runner | The Final Cut |
| Star Wars: A New Hope | Star Wars: A New Hope | Star Wars: A New Hope | (none) |
| Amadeus: Director's Cut | Amadeus: Director's Cut | Amadeus | Director's Cut |

## Impact

- Prevents duplicate film records from version suffixes
- Improves cache hit rate for film lookups
- Ensures consistent film matching across scrapers
- All 500 tests pass
