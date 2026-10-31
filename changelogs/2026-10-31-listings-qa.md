# Listings QA, 31 Oct 2026

**PR**: #XX
**Date**: 2026-10-31

## Changes
- `Festive Fun with Peppa Cinema Experience` cleans to `Festive Fun with Peppa`. The trailing `Cinema Experience` is peeled only when at least four characters remain, so `The Cinema Experience` stays a title.
- A showing-specific booking URL plus the same screen and the same clock (within two minutes) is one screening when the two film titles already clean to the same name. The pipeline updates that row instead of inserting another. If retargeting it collides with the canonical film, the extra source row is deleted. Different screens stay. Different films on one link stay, including Garden's bilingual pair (draft #854).
- `SLA 2026:` is stripped like the other festival acronyms. The code is `eventDescription` and `screenings.season`. `All Out Of Bubblegum Film Club:` becomes `THE SHINING` in the cleaner; the repair renames that film to `The Shining` when no 1980 row already exists, and moves screenings onto the 1980 row when one does. The club name is the note and the season.
- Garden titles shaped as a comma-separated extras list that mentions cocktails, an intro, or a making activity, then ` + ` and the film, store the film. `Italian cocktails, Morricone musical intro + Ennio` → `Ennio`. `'Wicker Sour' cocktails, straw man making + Wicker` → `Wicker`. The extras are the note. A note that was only the film title is replaced; `(4K restoration)` is kept by the repair.
- `scripts/repair-listings-qa-2026-10-31.ts` applies those moves and deletes leftover ticket copies whose titles clean to one film. Dry-run unless `--execute`. It was not run against production. Film rows are not deleted.

## Impact
- The next Everyman, Genesis, and Chiswick scrapes file Peppa under one title. Existing duplicate Everyman rows are removed by the repair script, or on the next scrape when the extra source id collides with the canonical film.
- Picturehouse Central's Scotland Loves Anime titles can match `A Silent Voice`, `Ninja Scroll`, `Ghost`, and the other films. No release year is invented. `Ghost` can still land on the wrong namesake until a year is known.
- Rio's Bubblegum screening of The Shining joins the existing film. Garden's Ennio and Wicker screenings join those films, with the cocktails line kept as the note.
- `28 Years Later: The Bone Temple`, `Master and Commander: The Far Side of the World`, and double bills such as `Tony Takitani + Talk Radio` are unchanged. Drafts #853 and #854 are not modified.
