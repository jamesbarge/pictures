# Season subtitles, BFI intro credits, Trans Awareness dash

**PR**: #XX
**Date**: 2026-10-25

## Changes
- `cleanFilmTitleWithMetadata` keeps a colon title when the right side is `Series` or `Season` plus a number (digits or one–twelve). `Heated Rivalry: Season One All-Dayer` stays whole. A short strand that is not a season still peels (`Mystery Strand: Carrie`).
- The Trans Awareness programme strand now peels on a spaced hyphen or en-dash, matching the existing pipe form. `Ponyboi - Trans Awareness programme 2026` becomes `Ponyboi`. `programmeStrandNote` copies `Trans Awareness programme 2026` into `eventDescription` when the screening has none.
- `bfiDirectorCredit` drops a BFI director that equals the raw listing or contains `:` or `+`. `Be My Baby + intro by programmer Anton Bitel` is an intro with no director. `Greta Gerwig, USA, 2019, 135m.` still yields Greta Gerwig.

## Impact
- The next Picturehouse scrape stores `Heated Rivalry: Season One All-Dayer`. Session ids do not include the title, so those screenings move onto the corrected film. The fragment row is left in place.
- The next Castle scrape stores `Ponyboi` and writes the strand onto the screening note when it is empty, so the showing can match the film that already has year, director and poster.
- The next BFI scrape stops writing the intro line as a director. An existing `Be My Baby` row keeps the credit it already has; this change does not rewrite stored films.
- Draft #829 keeps digit `Series N` / `Season N` and rejects event lines in the shared metadata parser. Draft #840 drops `:` and `+` credits on BFI preview titles. This branch is `main` and covers the word-number season, the intro line, and the dash form of the strand.
