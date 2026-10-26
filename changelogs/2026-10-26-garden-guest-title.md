# Garden guest credits leave the film title

**PR**: #853
**Date**: 2026-10-26

## Changes
- `cleanFilmTitleWithMetadata` peels a trailing `(YYYY) with <Guest Name>` from a listing. `Spider (2002) with Peter Suschitzky` becomes `Spider`, and the year hint is 2002. The guest is two or three capitalised words, the same shape as the existing preview-of guest credit.
- `guestAppearanceNote` returns `with Peter Suschitzky`. `classifyScreening` copies that into `eventDescription` when the scraper left the note empty.
- Titles that use "with" as part of the name stay whole: `Dances with Wolves`, `Interview with the Vampire (1994)`, `The Girl with the Dragon Tattoo (2011)`, `Gone with the Wind`, and Garden's `Bar Shorts with Darren Walsh & Russell McLean`. A one-word tail and a second `(YYYY)` (a double bill) stay too. `Live Score` and `Shadow Cast` are not guests: the existing live-score strip still removes `with Live Score`, and the shadow-cast strip on draft #835 still sees its own tail.
- `scripts/repair-listings-qa-2026-10-26.ts` rewrites the stored film. Upcoming screenings move onto an existing Spider row whose year is 2002. Otherwise the row is renamed and the note is set. Film rows are not deleted. Dry-run unless `--execute`. It was not run against production.

## Impact
- The next Garden scrape matches Cronenberg's Spider instead of a title that includes the year and the cinematographer. Garden's source id still slugifies the raw title, so the existing screening updates in place.
- The repair script is the one-off for the row already stored (Garden, 9 Nov 2026 20:00Z, performance 6265917). It was not executed.
- Drafts #829, #830, #835 and #837 peel other event extras. This does not redo those cases. The new peel runs at the start of the decoration loop, and the note is a third branch of the existing empty-note check.
