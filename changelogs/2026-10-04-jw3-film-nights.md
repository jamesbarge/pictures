# JW3 keeps film nights filed outside the Cinema genre

**PR**: TBD
**Date**: 2026-10-04

## Changes
- `src/scrapers/cinemas/jw3.ts`: the Spektrix event filter moves into `jw3FilmTitle()`. Every `Cinema` genre event is kept under its own name, as before. An event from any other genre is kept only when the segment before its last colon names a movie or film night or club (`/\b(movie|film)\b.*\b(night|club)\b/i`), and its film title is the text after that colon.
- This brings in the two Young JW3 film nights filed under `Young Professionals`: Call Me By Your Name (Wed 21 Oct, 18:30) and Theater Camp (Wed 16 Dec, 18:30), listed under the film title instead of `Young JW3 Queer Movie & Pizza Night: ...`.
- `src/scrapers/cinemas/jw3.test.ts` (new): 14 tests on verbatim names from the 2026-10-04 feed, covering the kept film nights and the near misses (a UKJF shorts awards evening, `Friday Night Dinner`, talks whose descriptions mention films, a TV episode screening).
- `src/scrapers/SCRAPING_PLAYBOOK.md`: JW3 section records the rule, the evidence behind it and its limits.

## Why the name
The Spektrix feed has no structured field that marks these nights. Across all 287 events on 2026-10-04, genre, every `attribute_*` field and the instance seating plan match the workshops around them: both film nights use the general plan that 117 non-film instances share. Description keywords also match talks about film stars, film clips and a TV episode screening. The rule keeps 3 of the 214 non-Cinema events (the two upcoming nights and the past Film Club: Entebbe) and nothing else.

## Verification
- Live dry parse (no database writes): 66 JW3 screenings against 64 from the unchanged scraper; the 2 extra rows are the two film nights, each with a `ChooseSeats` booking URL and a `jw3-{instance id}` sourceId.
- `npm run test:run`, `npx tsc --noEmit -p .` and eslint on changed files pass.

## Impact
- JW3 gains its Young JW3 film nights. If JW3 renames the strand without "Movie/Film ... Night/Club" in the label, those nights drop out again; the playbook says to recheck.
- The row time is the ticketed 18:30 start, which includes a pizza party; the film itself starts at 19:15.
- To persist: `npm run scrape jw3`.
