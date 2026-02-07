# Enrich Upcoming Films Missing TMDB Data

**Date**: 2026-02-07
**Type**: Feature / Data Fix
**PR**: #106

## Changes

### `src/scrapers/pipeline.ts`
- Added 20 new event prefixes to `EVENT_PREFIXES` array for venue-specific series (DocHouse, Pink Palace, Classic Matinee, Category H, etc.), branded series (Bar Trash, Pitchblack Playback, Phoenix Classics), cultural/themed events (Surreal Sinema, Drink & Dine), and broadcast events (RBO Cinema Season)
- Added 4 new suffix removal patterns: full `+ Q&A with ...` trailing text, `Presented by ...`, bullet anniversary suffixes, and `(Extended Edition/Cut)` parentheticals
- Exported `cleanFilmTitle` function for use by enrichment scripts

### `src/scripts/enrich-upcoming-films.ts` (new)
- Targeted enrichment script for films with upcoming screenings missing TMDB data
- HTML entity and mojibake decoding (handles double-encoded UTF-8 like `&Atilde;&iexcl;` -> `a`)
- Applies `cleanFilmTitle` prefix/suffix stripping
- AI title extraction via `extractFilmTitle` for complex cases
- Bad year clearing (year > 2025 assumed to be scraper metadata, not film release year)
- Duplicate TMDB ID guard (skips gracefully when another film already has that TMDB ID)
- `--dry-run` flag support
- Rate-limited TMDB calls (300ms between requests)

### `package.json`
- Added `enrich:upcoming` npm script

## Results (first run)
- 73 films enriched with full TMDB data (posters, cast, genres, synopsis, etc.)
- 24 of those also received Letterboxd ratings
- 26 duplicate film records detected and gracefully skipped
- Reduced unenriched upcoming films from 403 to 330
