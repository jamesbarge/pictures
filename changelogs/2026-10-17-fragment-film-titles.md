# Fragment film titles from the 17 Oct 2026 listings QA

**PR**: pending
**Date**: 2026-10-17

## Changes
- `cleanFilmTitleWithMetadata` keeps the left side of a colon when the right side is a note, a series number, or an edition subtitle:
  - a lowercase tail (`The Brixton Reel: in commemoration of Black History Month` → `The Brixton Reel`)
  - `Series N` / `Season N` (`Blake’s 7: Series 3 + Q&A` → `Blake’s 7: Series 3`)
  - `Edition` after a one- or two-word name (`MilkTea Presents: Mixtape: Youth Edition + Q+A` → `Mixtape: Youth Edition`; `Linda Linda Linda` is unchanged)
- `Family Film` strips only when a colon follows, so `Family Film Week: A Shuffle of Shorts! + Pre-film Crafting` stays `Family Film Week: A Shuffle of Shorts!`. `+ Pre-film Crafting` is an extra. `Family Film Club:` and `Family Film:` still strip, and `Family Film Week: Matilda` still becomes `Matilda`.
- `Met Opera` now takes optional `Live` or `Encore` and the season code in one match, and the prefix loop repeats up to four times. `Met Opera Encore 2026-27: Macbeth`, `Met Opera Live 2026-27: Macbeth` and a stored `2026-27: Macbeth` all clean to `Macbeth`. `Met Opera: Tosca` stays `Tosca`. `The Metropolitan Opera 2026/27: Macbeth` is left whole.
- A comma-list of extras before a plus yields the film after the plus: `Vampire Ball: Live Violin, Cocktails + The Hunger` → `The Hunger`. A plain double bill (`The Gruffalo + The Gruffalo's Child`) is unchanged. The sync extractor no longer splits a double feature whose left half contains a colon, which is what used to drop `The Hunger` and `Family Film Week` before the cleaner ran.
- A ` - … at Genesis` strand is stripped, and the release year it was hiding becomes the hint: `Halloween (1978)- Halloween at Genesis` → `Halloween`, year 1978.
- `parseFilmMetadata` no longer treats a comma-less string as a director, and rejects any "name" containing `:` or `+`. BFI's `Blake’s 7: Series 3 + Q&A` and `Dracula: Restored and Uncut + extended intro` stop landing in `films.directors`. `Dracula: Restored and Uncut + extended intro` already cleaned to `Dracula`.
- Barbican day cards that end in `...` are replaced with the event-page `h1`. `FFW x All Kaiju Attack: Ghidorah, The Three-Headed...` becomes `Ghidorah, The Three-Headed Monster` once the cleaner strips the curators' introduction. A failed event-page fetch keeps the card title.
- ICA already joins a `<br>` inside the title. A regression test locks `Experimenta Special Presentation<br>Shab-Nameh: Women of Iran’s Forgotten Left` to the full title with director Maryam Tafakory.
- `repairFragmentFilm` and `scripts/repair-fragment-film-titles.ts` rewrite rows whose other half was already discarded (exact titles from this QA, guarded by booking URL or credits where the fragment could be a real title, plus a director field that still holds the raw event line). Dry-run unless `--execute`. Updates title, directors and year. Does not delete films or screenings. Not run against production.

## Impact
- The next scrape stores the corrected title for new parses. Picturehouse, BFI and Genesis source ids do not include the title, so the screening moves onto the corrected film. Garden, Barbican and ICA source ids include the title, so the repair script retitles the existing film and the next scrape updates that screening in place instead of inserting a second one.
- `Macbeth` can match a feature film of that name on TMDB, the same risk the cleaner already accepts for `Tosca`.
- A glued ICA title with no space after `Presentation` still splits at the colon. The scraper inserts that space.

## Verification
- Regression tests use the live event strings from the 17 Oct 2026 API snapshot.
- `npm run test:run`, `npm run lint` and `npx tsc --noEmit`.
