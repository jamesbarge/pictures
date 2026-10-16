# One Nickel, and titles without access notes or HTML entities

**PR**: #815
**Date**: 2026-10-16

## Changes

- Confirmed the live Nickel split is not a second registry entry. `nickel-v2.ts` and `the-nickel.ts` both use cinema id `the-nickel`. The scraper registry, task registry, and `resolveCinemaId` already send every write to `the-nickel`. `nickel` remains a legacy alias.
- The 16 Oct 2026 listings QA still showed 37 duplicated showings under cinema id `nickel`, including five whose film titles were the raw feed (`THE UNKNOWN (ON 16MM`, `THE MAD BOMBER (ON 16MM)`, `ERASERHEAD (ON 16MM)`) while `the-nickel` held the cleaned titles. Those rows share a booking URL and source id with the canonical copies, and different film ids.
- `src/db/migrations/canonicalize-cinema-ids.ts` previously treated a collision as the same film id at the same time only. Moving the dirtier copy onto `the-nickel` would then violate the `(cinema_id, source_id)` unique index, so the alias could not be retired. A legacy row now collides when the source id matches, or when the booking URL matches at the same instant. Colliding rows are deleted. A legacy cinema with no screenings left is deleted, or marked inactive if a foreign key blocks the delete.
- Title normalisation strips access parentheticals such as `(with subtitles for the D/deaf and those experiencing hearing loss)`, `(Subtitled)`, and `(Audio Described)`. The Rio listing `HACKNEY CHILDREN'S FILM FEST: Paddington &amp; Storytime` decodes to `Paddington & Storytime`. `(ON 16MM)`, including the truncated `(ON 16MM`, was already stripped and is now covered by the QA strings.
- When a scraper has already set a format, classification still reads subtitles, audio description, relaxed, and 3D off the title.

## Impact

- After the migration, the public listings have one Nickel. The five dirtier film rows are no longer attached to a second copy of the same showing.
- The next scrape, and `npm run cleanup:upcoming -- --execute`, store `Disclosure Day` and `Paddington & Storytime` instead of the raw listing text. `Disclosure Day` keeps `hasSubtitles`.
- Other legacy cinema ids (`close-up`, `phoenix`, `olympic`, and the rest of `legacyIds`) use the same collision rule. A shared film-page URL at two different times is still two showings.

## Production steps

Do not run these until this branch is deployed, so a later scrape cannot write `nickel` again. Both commands are dry-run unless `--execute` is passed. `--apply` does not apply.

```bash
npm run db:migrate-cinema-ids -- --execute
npm run cleanup:upcoming -- --execute
```
