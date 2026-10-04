# Title cleaner covers festival and format decorations; current UK releases match at first-run venues

**PR**: #TBD
**Date**: 2026-10-04

## Changes
- `film-title-cleaner.ts`: festival tags (FFFL, FFF, LIFF, (LPFF), (LoLaFF), London Breeze notes, case-sensitive so "The Meaning of Liff" survives); festival and strand prefixes (LPFF/UKJFF/HKFF/LIFF/FFFL with year, Sheffield DocFest, Hackney Children's Film Fest, Doc'n Roll, Black History Month YYYY, Classroom Cinema, Babykino, Members' Screening, Opening/Closing Night Gala, "<org> presents:", BAR TRASH presents, RBO/ROH Encore and Met Opera season codes, bare "2026-27:"); format and version notes (16/35/70mm, on 16mm, Re-release, Remastered, Theatrical and North American Cut, the 4K family); ": The Director's Cut" with a director's possessive credit; anchored extras (intros, Q&A, talk, ScreenTalk, panel, book launch, live score, Preview, anniversaries, (aka ...), (BIA)); abbreviated part markers after a title ending in a letter. Fixes "Kill Bill: Vol. 2" becoming "Vol. 2".
- `client.ts`: `getCurrentReleases()` reads GB `now_playing` and `upcoming` (up to 20 pages each), caches for 6h per client, shares in-flight requests and never caches failures.
- `match.ts`: when the ambiguity gate would skip, accept exactly one current GB release with an equal normalized title. Runs only with `hints.allowCurrentRelease` (false by default), and any year hint more than a year from the release blocks it. Strategy `current-release`.
- `pipeline.ts` / `cinema-registry.ts`: `allowsCurrentReleaseMatching(cinemaId)` enables the rule for mainstream, non-repertory venues and refuses unknown ids. The Nickel's registry programming focus becomes repertory/arthouse. Past release years found behind decorations now reach the matcher.
- `film-matching.ts`: the film cache also keys films by `normalizeTitle(original_title)`. Title keys win; aliases shared by two films are dropped; blocklisted TMDB ids get none.
- Tests: 534-title fixture with an idempotency check, 39 merge-target key assertions, current-release client and matcher tests, cache alias precedence and collision tests.

## Impact
- Next week's wide releases match without a manual pass, and repertory screenings of classics with the same names stay protected.
- Manual merges from 2026-10-04 survive re-scrapes for 39 of the merged venue titles. "De Gaulle: Part 2- Liberte" still needs a manual alias.
- Known limits: the cache ignores year, so seven groups of existing rows now share a key (for example Limite 1931 and Limit 2022), and opera work titles share keys with films of the same name. A year-aware cache would fix this class.
