# Film cache picks namesakes by release year

**PR**: #820
**Date**: 2026-10-16

## Changes
- `FilmCache` gains `namesakes`, every film under a normalized title. `initFilmCache` and `addToFilmCache` fill it.
- `lookupFilmInCache(cache, title, scraperYear)` returns the namesake within a year of the scraper's release year. Without a usable year it returns the title's default film, as before.
- `releaseYearHint` holds the existing year discipline (a year from 1900 up to last year counts; the current year may be the screening year) and `matchAndCreateFromTMDB` now uses it. `yearConflicts(film, year)` reports when the cached film's year is more than a year off.
- `getOrCreateFilm`: when the cached film conflicts with the scraper's year, it calls `matchAndCreateFromTMDB` with the year and the new `requireYearAgreement` flag, which returns null (and writes nothing) if TMDB's match is more than a year off. A null keeps the cached film, so the worst case is the old match. The similarity search is skipped on this path because it would return the same cached film.
- The title's default film (for listings with no year) is the one with TMDB data, then the newer of two TMDB films. Two rows without TMDB data keep the first loaded, because the newer is usually a screening-year stub ("Nostalghia" 2026 next to Tarkovsky's 1983 row).
- `riversideFilmMetadata` reads `Director:` and `Year of Release:` from the event's `search` HTML; 21 of 39 cinema events carry a year and 22 a director.
- `SCRAPING_PLAYBOOK.md` records the rule and corrects the "the cache ignores year" note.

## Why
Found while checking #816's effect on Riverside. Measured on 2026-10-16, 11 titles were shared by two or more TMDB films with upcoming screenings. PCC sends a release year and director, yet its screenings sat on the wrong namesake:

| Title | PCC lists | Cached film it got |
|---|---|---|
| Heat | 1995, Michael Mann | 1972 |
| Tenet | 2020, Christopher Nolan | 2026 |
| Blue Velvet | 1986, David Lynch | 2011 |
| Possession | 1981, Andrzej Zulawski | 2012 |
| Halloween | 1978, John Carpenter | 2007 |

Riverside's "Dracula: 4K Restoration" is Hammer's 1958 film; after #816 cleaned the title to "Dracula" it landed on Radu Jude's 2025 film, the only cached Dracula.

## Verification
- The real `initFilmCache` over the production films table (read-only) now returns Heat 1995, Tenet 2020, Blue Velvet 1986, Possession 1981 and Halloween 1978 for PCC's years, and flags Dracula 1958 as a conflict for TMDB.
- The no-year default changes for 12 titles; 3 have upcoming screenings. Heat moves to Mann's film (Screen on the Green sends no year). Halloween II and Suspiria are only at PCC, which sends 1981 and 1977, so their screenings keep the right film.
- New tests: 5 fail on the old cache and pass now; the guards (TMDB data beats a newer stub, two stubs keep the first, agreement is only checked when asked) pass on both. Riverside metadata has its own test.
- `npm run test:run` (2,941 of 2,942; the one failure is `anomalies/verify` timing out under full-suite load and passing 5/5 alone), `npm run lint` (0 errors), `npx tsc --noEmit` pass.

## Impact
- The first `/scrape` after merge re-points these screenings: the upsert sets `filmId`. Riverside's Dracula creates the Hammer film from TMDB on that run.
- Venues that send no year (Everyman, Picturehouse, and 24 of 37 independents) get the newer TMDB film. A repertory venue in that group still needs to send a year to reach an older namesake.
