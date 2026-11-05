# Listings QA, 5 Nov 2026

**PR**: #860
**Date**: 2026-11-05

## Changes
- Drop a director that is the listing title, that contains the title, or that the title contains unless the title opens with that name. A reused film row has that credit cleared when this scrape was the one that rejected it.
- PCC reads the release year from `.running-time` and `Directed by` from `.film-info`. The Room is 2003, Tommy Wiseau. "Directed by Monkey Tennis" is dropped.
- BFI's exact feed title `The Trip: Director's Cut` (curly or straight apostrophe) is Roger Corman, 1967. An undated film with no TMDB id is offered to TMDB again when a release year is now known, and the match is kept only when the year agrees.
- INDY's film named Silence at 161 minutes is Martin Scorsese, 2016. Chiswick's 19 Nov 2026 19:45 showing is that film; the feed's releaseDate is the showing day.
- `extractFilmTitleSync` unwraps a quote pair around the whole title only. `Joni Mitchell 'Hejira'` keeps the closing quote, and the anniversary note is `(50th Anniversary)`.
- JW3 peels a lowercase screening description after a colon. `Babka: short film screening and panel discussion` stores Babka, with the description on the screening.

## Impact
- The next local scrape can move these screenings onto the corrected films. Source ids do not include the cleaned title at Castle, JW3, PCC or Chiswick, and BFI's source id still uses the feed title, so the existing screening row is updated rather than duplicated.
- An existing film's director list changes only when this scrape rejected the incoming credit as a title leak (Monkey Tennis). A fresh scrape does not rewrite a director that the scraper no longer sends (the stored "The Silence" credit) except by moving the screening onto Scorsese's film.
- Nothing here was run against production.
