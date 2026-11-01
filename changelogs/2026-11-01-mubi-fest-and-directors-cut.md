# MUBI Fest titles and Director's Cut casing

**PR**: #856
**Date**: 2026-11-01

## Changes
- Picturehouse `MUBI FEST LIVE: A LONG WINTER` (15 Nov 2026, 17:30 UTC, Central, Crouch End, Greenwich, Clapham) was stored as the film title because the colon handler treats a right-hand side starting with "A" as a subtitle. The prefix is now stripped. A shouty remainder of that prefix is title-cased to `A Long Winter`. Other shouty titles (`THE SECRET AGENT`, `AKIRA`) are unchanged.
- The booking slug ends in `q-a` because the source title carries `+ Q&A`. That stays `eventType: q_and_a`. The festival name is `eventDescription` (the field the public listings return) and `screenings.season`. A description that is only `Q&A` is replaced by the festival name. Any other description is left alone.
- BFI Southbank `Little Shop of Horrors (director’s Cut)` (1986) keeps the film title and stores `Director's Cut` as the screening note. The parenthetical is recognised with a straight or curly apostrophe. The colon form (`Brazil: Director's Cut`) was already stripped and still is.
- `smartTitleCase` capitalised `charAt(0)`, so `(DIRECTOR'S CUT)` became `(director's Cut)`. It now capitalises the first letter, and a letter after an apostrophe when that letter starts a name (`O'Brien`). A possessive `'s` stays lower.

## Impact
- The next Picturehouse and BFI scrapes store the film titles TMDB can match. No release year is invented for `A Long Winter`.
- Rows already stored are rewritten by `scripts/repair-listings-qa-2026-11-01.ts`, which is a dry run unless `--execute`. It was not run. Film rows are not deleted. Little Shop screenings move onto a 1986 row when one exists.
- `screenings.season` is still not in the public listings select. `eventDescription` is what the payload shows.
