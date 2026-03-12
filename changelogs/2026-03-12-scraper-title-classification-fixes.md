# Scraper Title & Classification Pattern Fixes

**PR**: #TBD
**Date**: 2026-03-12

## Changes

### film-title-cleaner.ts
- Added 8 new community/cultural screening series prefixes to EVENT_PREFIXES array
- Added pagination artifact stripping (`p17` from BFI titles)
- Added "on 35mm/70mm" format suffix stripping
- Added complex Q&A/event suffix stripping ("+ Live Recording of...", "+ Panel hosted by...")
- Added duration-prefixed event suffix stripping ("(60 mins) + Panel")
- Ordering fix: duration-prefixed patterns now run before basic Q&A strip

### content-classifier.ts
- Added 4 new deterministic event patterns: musical bingo, comedy club/night, member poll/quiz, in conversation with
- Expanded live broadcast patterns: The Royal Opera, ROH Cinema/Encore, RBO Cinema/Encore, Exhibition on Screen
- Added concert detection pattern: "in concert"
- Added 8 community screening series to isLikelyCleanFilmTitle() to route to AI

### bfi.ts
- Removed pagination rejection from isSuspiciousTitle() — titles like "Hamnet p12" are now cleaned by cleanFilmTitle() instead of silently dropped

### Tests
- 26 tests for film-title-cleaner covering all new patterns
- 25 tests for content-classifier covering event, live broadcast, concert, and film classification

## Impact
- Previously dropped BFI titles with pagination markers are now recovered and matched to TMDB
- Community screening series titles are properly stripped of event prefixes before TMDB matching
- More content types are deterministically classified, reducing AI API calls
- Film format suffixes ("on 35mm") no longer pollute TMDB searches
