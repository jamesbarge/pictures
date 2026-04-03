# Fix Systemic Data Quality Issues in Scrapers & Enrichment

**PR**: #TBD
**Date**: 2026-04-03

## Changes

### Film Title Cleaner (`src/scrapers/utils/film-title-cleaner.ts`)
- Added 20+ new event prefix patterns discovered via data-check patrols:
  - Rio Cinema: `RIO FOREVER:`, `RIO FOREVER x`, `Naturist Screening:`
  - BFI: `Beyond:`, `Woman with a Movie Camera Preview:`, `Japanese Film Club:`
  - Events: `TV PARTY, TONIGHT!`, `Skateboard Film Club:`, `Young Filmmakers Club:`
  - Seniors: `Seniors' Free Matinee:`, `Seniors' Paid Matinee:`
  - Festivals: `Doc'n Roll`, generic `[Org] Film Festival presents:` pattern
  - Premieres: `LONDON PREMIERE`
- Added re-release/premiere suffix stripping: `(2026 Re-release)`, `(World Premiere)`, `(UK Premiere)`, `(Sing-Along)`, `- Weird Wednesdays`
- Added HTML entity decoding (`&amp;`, `&frac12;`, `&rsquo;`, etc.)
- Added mojibake fix for UTF-8/Latin-1 encoding corruption (Â prefix removal)

### Director Validation (`src/scrapers/utils/metadata-parser.ts`)
- Added `isLikelyDirectorName()` function that rejects:
  - Known venue/screen patterns (Screen NFT, IMAX, EDUCATION LEARNING)
  - Screen/room identifiers with digits
  - ALL CAPS strings with 4+ words (venue/event names)
  - Strings containing time patterns or day-of-week names (schedule text)
- Applied to the metadata parser fallback path to prevent scraper garbage entering the directors field

### Auto-Repertory (`src/scrapers/utils/film-matching.ts`)
- Films created without TMDB data now auto-set `is_repertory = true` when scraper year < currentYear - 2
- Previously hardcoded to `false`, causing 35+ wrong_new_tag issues per cycle

### Curzon Booking URLs (`src/scrapers/chains/curzon.ts`)
- Changed from `?sessionId=` deep links (broken — show "Showtime unavailable") to film detail page URLs (`/films/{slug}/{filmId}/`)
- Verified via browser automation that all `?sessionId=` URLs fail in real browsers

### Tests (`src/scrapers/pipeline.test.ts`)
- 21 new test cases covering all new patterns
- 76 total tests passing

## Impact
- Prevents ~40 recurring duplicate film entries per scrape cycle
- Eliminates garbled director data from BFI scraper
- Fixes all Curzon booking links for users
- Reduces data-check patrol workload by addressing root causes instead of symptoms
