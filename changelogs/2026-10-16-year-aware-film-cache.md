# Film cache picks namesakes by release year

**PR**: #820
**Date**: 2026-10-16

## Changes
- `FilmCache` gains `namesakes`, every film under a normalized title. `initFilmCache` and `addToFilmCache` fill it.
- `lookupFilmInCache(cache, title, scraperYear)` returns the namesake closest to the scraper's release year, within a year. Without a usable year it returns the title's default film.
- `releaseYearHint` holds the existing year discipline (a year from 1900 up to last year counts; the current year may be the screening year) and `matchAndCreateFromTMDB` now uses it. `yearConflicts(film, year)` reports when the cached film's year is more than a year off.
- `getOrCreateFilm`: when the cached film conflicts with the scraper's year, it calls `matchAndCreateFromTMDB` with the year and the new `requireYearAgreement` flag, which returns null (and writes nothing) if TMDB's match is more than a year off. A null keeps the cached film, so the worst case is the old match. The similarity search is skipped on this path because it would return the same cached film.
- The title's default film (for listings with no year) is the namesake with the most upcoming screenings, then the one with TMDB data, then the first loaded. That is the film the title already resolves to, so venues that send no year keep their matches, and the default follows as year-sending venues move screenings. `initFilmCache` gets the counts with one small query limited to films that share a title (`countUpcomingForNamesakes`); if it fails, every count is zero and the old rule decides. A film created during a run never displaces the default.
- `processScreenings` groups a venue's screenings by title plus the scraper's release year, so a venue showing both Draculas gets two lookups.
- A year taken from a decoration ("Akira (2025 Re-release)") still informs TMDB on a cache miss. Namesake picks and the conflict path use only a scraper's year or a plain "(YYYY)" in the title.
- The conflict-path TMDB call has its own 8s ceiling, so a slow TMDB falls back to the cached film inside the caller's 20s.
- `riversideFilmMetadata` reads `Director:`/`Directors:` and `Year of Release:` from the event's `search` HTML, in both its `<p>` and table-row forms, with cheerio decoding entities; on the 2026-10-16 feed that is 21 of 39 cinema events with a year and 22 with a director.
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
- The no-year default changes for 0 titles, so venues that send no year keep today's films. (Two earlier drafts, "newest TMDB film" and "first created", moved 12 and 43 titles, including Picturehouse's Blade and 38 chain Nutcracker screenings; the review caught the first.)
- Tests: cache namesake picks, closest year, a dated namesake behind an undated default, count-based defaults, `requireYearAgreement`, Riverside metadata (both markups, entities, "Music Director:"), and `pipeline-namesake-years.test.ts` for the grouping key, decoration years, the TMDB-miss fallback and the 8s timeout fallback.
- `npm run test:run` (171 files, 2,951 tests), `npm run lint` (0 errors), `npx tsc --noEmit` pass.

## Review
A `/code-review high` pass raised 10 candidates. Fixed: grouping by title alone, the conflict call sharing the 20s ceiling, decoration years driving namesake picks, the no-year default flipping venues onto remakes, order-dependent picks, an undated default hiding a dated namesake, and the Riverside director regex. Left: repeat TMDB calls for a title TMDB never vouches for (one call per title per venue per run), alias keys without namesake lists (the conflict path already reaches TMDB for them), and the duplicated year arithmetic.

## Impact
- The first `/scrape` after merge re-points these screenings: the upsert sets `filmId`. Riverside's Dracula creates the Hammer film from TMDB on that run.
- Venues that send no year (Everyman, Picturehouse, and 24 of 37 independents) keep the film each title resolves to now. Once PCC's screenings move to Mann's Heat, that film holds the most screenings and Screen on the Green's no-year listing follows on its next scrape.
- One extra query per venue in `initFilmCache`, limited to films that share a title.
