# Data Cleanup: Films Missing TMDB Through Feb

**PR**: TBD
**Date**: 2026-02-07

## Changes
- New one-time script `src/scripts/cleanup-feb-films.ts` with hardcoded classification map for 166 entries
- Four actions: `delete` (non-films), `clean` (dirty titles), `match` (retry TMDB), `skip` (too obscure)
- Added `cleanup:feb-films` npm script with `--dry-run` support
- Handles HTML entity/mojibake decoding and title normalization for DB title matching

## Results
- **62 deleted**: Events, talks, quizzes, concerts, workshops, TV shows, short film compilations
- **36 TMDB matched**: Real films enriched with full metadata (title, year, directors, cast, genres, poster, etc.)
- **19 duplicate skipped**: Films that matched TMDB but another DB entry already had that TMDB ID
- **14 unmatched**: Real films that TMDB couldn't find (very obscure titles)
- **30 skipped**: Too obscure or ambiguous for reliable TMDB matching
- **18 Letterboxd ratings** backfilled for newly matched films
- **12 posters** backfilled from TMDB

## Impact
- Cleaner film database with fewer non-film entries polluting search and browse
- Better data quality for films screening through February 2026
- Reduced noise in admin dashboard health metrics
