# Fix Duplicate Films & Pipeline Resilience

**Date:** 2026-02-15
**Branch:** `fix/duplicate-films-pipeline-resilience`

## Problem

Duplicate film entries appearing on pictures.london caused by multiple pipeline weaknesses:
- `normalizeTitle()` used `[^\w\s]` regex which destroyed unicode/accents ("Amélie" → "amlie")
- Event prefixes not fully stripped ("Family Film Club:", "Galentine's Day:", "RBO Encore:")
- Trailing years treated as title text ("Crash (1997)")
- AI title extraction skipped for titles that looked "clean" but weren't
- Fuzzy matching thresholds too conservative (0.7 auto-accept)
- No TMDB ID-based dedup as secondary check

## Changes

### Pipeline Fixes (`src/scrapers/pipeline.ts`)

1. **Unicode-safe `normalizeTitle()`**: Uses NFKD decomposition + diacritical mark stripping instead of destructive `[^\w\s]`. Preserves CJK characters. Maps "Amélie" → "amelie" consistently.

2. **Year stripping**: Removes trailing `(1997)` patterns from titles, storing year as TMDB matching hint instead.

3. **Expanded event prefixes**: Added 15+ new patterns including Galentine's Day, Valentine's Day, Christmas Classics, RBO/ROH Encore, Varda Film Club, Bar Trash, Dochouse, format prefixes (35mm, 70mm IMAX, 4K Restoration).

4. **TMDB ID secondary index**: Film cache now indexes by TMDB ID. Two films with the same TMDB ID are always the same film — checked before fuzzy title matching.

### Matching Thresholds (`src/lib/film-similarity.ts`)

- HIGH_CONFIDENCE_THRESHOLD: 0.7 → 0.6 (auto-accept)
- LOW_CONFIDENCE_THRESHOLD: 0.4 → 0.35 (Claude confirmation range)
- MINIMUM_THRESHOLD: 0.3 → 0.25

### Stricter AI Extraction (`src/lib/title-extractor.ts`)

`isLikelyCleanTitle()` now returns false for:
- Titles containing parenthesized years (e.g., "Crash (1997)")
- ALL CAPS titles (e.g., "LITTLE AMELIE")
- Titles longer than 60 characters (likely have appended cruft)

### Enhanced Cleanup Script (`scripts/cleanup-duplicate-films.ts`)

Two-strategy duplicate detection:
1. **TMDB ID**: Films sharing the same tmdb_id are definitionally identical
2. **Trigram similarity**: pg_trgm fuzzy matching with union-find clustering

For each cluster, picks the "best" record (has TMDB ID, poster, most complete metadata) and reassigns all screenings, season_films, and user_film_statuses.

### Tests (`src/scrapers/pipeline.test.ts`)

50 new unit tests covering:
- `normalizeTitle()`: unicode handling, leading article stripping, punctuation, case normalization
- `cleanFilmTitle()`: year stripping, event prefix removal, BBFC ratings, Q&A suffixes, format notes, combined scenarios

## Files Changed

| File | Change |
|------|--------|
| `src/scrapers/pipeline.ts` | Fixed normalizeTitle, expanded prefixes, added year stripping, TMDB index |
| `src/scrapers/pipeline.test.ts` | New: 50 unit tests |
| `src/lib/film-similarity.ts` | Lowered matching thresholds |
| `src/lib/title-extractor.ts` | Stricter isLikelyCleanTitle() |
| `src/lib/title-extractor.test.ts` | Fixed test expectation for >60 char title |
| `scripts/cleanup-duplicate-films.ts` | Enhanced with TMDB + trigram dedup |
| `RECENT_CHANGES.md` | Added entry |
