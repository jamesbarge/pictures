# Title cleaner keeps the film half of screening-description colons

**PR**: #TBD
**Date**: 2026-10-16

## Changes
- `cleanFilmTitleWithMetadata` strips a colon suffix made only of screening words before the generic colon handler runs. The new `SCREENING_NOISE_COLON_SUFFIX` needs two or more of: an ordinal, 4K, 16mm, 35mm, 70mm, VHS, IMAX, anniversary, restoration, restored, remastered, uncut, roadshow, tour, marathon, screening or premiere. An "and" or "&" may join two of them ("Restored and Uncut"). It replaces the single-purpose `: 4K Restoration Premiere` replace, whose tests still pass.
- Two or more words are required, so a one-word title after an event prefix survives: "Film Club: Restoration" still cleans to Restoration (the 1995 film).
- The suffix may be followed by a `+ extended intro` tail, a `(1931)` year or a `[...]` note, which the later rules handle. "Dracula: Restored and Uncut + extended intro" cleans to Dracula, and "Dracula: 4K Restoration (1931)" to Dracula with 1931 as the year hint.
- The `isFilmSeries` list gains `halloween iii`, `halloween h20`, and exact-match `dracula`, `elvis` and `evangelion`, for titles where the whole colon string is the film's name. "Halloween Special: Hocus Pocus" still strips its event prefix.
- `src/scrapers/SCRAPING_PLAYBOOK.md` records the rule under Shared Rules.

## Why
The generic colon rule keeps the after-colon half whenever the before-colon half is three words or fewer. On the 2026-10-15 run that rule handled most of the 301 colon titles correctly ("DocHouse: Avedon" becomes Avedon). It mangled these:

| Raw title | Before | After |
|---|---|---|
| Short Cuts : 35mm Roadshow Tour | 35mm Roadshow Tour (then "Roadshow Tour") | Short Cuts |
| Dracula: 4K Restoration | 4K Restoration | Dracula |
| Dracula: Restored and Uncut + extended intro | Restored and Uncut | Dracula |
| Donnie Darko: 25th Anniversary VHS Screening | 25th Anniversary VHS Screening | Donnie Darko |
| The Hunger Games: Marathon Screening | Marathon Screening | The Hunger Games |
| Halloween III: Season of the Witch | Season of the Witch | unchanged |
| Halloween H20: 20 Years Later | 20 Years Later | unchanged |
| DRACULA: PRINCE OF DARKNESS | PRINCE OF DARKNESS | unchanged |
| ELVIS: THAT'S THE WAY IT IS | THAT'S THE WAY IT IS | unchanged |

In the database that left 7 films (12 upcoming screenings) with no TMDB match, so no poster or details, including all four PCC Short Cuts screenings on 6-11 Nov. "That's the Way It Is" matched a 2018 film; the Elvis concert film is from 1970.

## Verification
- Replayed 2,520 titles (every raw title from the 2026-10-15 scrape log, the 2026-10-04 unmatched-titles fixture, and every film title with an upcoming screening) through the old and new cleaner. Exactly 11 change: the 9 above plus two double-bill strings that were wrong before and stay imperfect ("Evangelion: Death (True)² + The End of Evangelion : Double Feature" now keeps its prefix; "Family Film Week: Matilda: 30th Anniversary + bookmarks" now cleans to "Matilda + bookmarks").
- 16 new tests in `film-title-cleaner.test.ts`: 11 fail on the old cleaner and pass on the new one; 5 guards pass on both.
- A code review replayed 1,129 of the titles independently, timed 100k-character adversarial inputs at about 15 ms (same as the old cleaner), and found the trailing-year case above, now covered.
- `npm run test:run` (168 files, 2,914 tests), `npm run lint` (0 errors) and `npx tsc --noEmit` pass.

## Impact
- The data repairs itself on the next scrape: the screening upsert sets `filmId` on conflict (`src/scrapers/pipeline.ts`), so the first `/scrape` after merge moves these screenings onto correctly titled films. `npm run db:cleanup-films` then removes the orphaned "Roadshow Tour" and "4K Restoration" film rows; it is a manual step outside `/scrape`.
- The franchise list only covers names seen so far. The lasting alternative is to try TMDB with the full title before splitting at the colon, deferred until the list grows.
