# One Nickel, and titles without access notes

**PR**: #815
**Date**: 2026-10-16

## Changes

- The duplicate Nickel listings come from an orphaned Inngest Cloud cron (`scheduled-scrape-all`, daily at 06:00 UTC). It calls a Vercel deployment from before #478, whose code still writes the legacy cinema id `nickel` and runs an older title cleaner. On 16 Oct every `nickel` row in production was last written between 06:00 and 06:03 UTC, and the `nickel` cinema row was re-created on 5 Oct at 06:04 UTC after an earlier deletion. The current scrapers, the scraper registry and `resolveCinemaId` all write `the-nickel`; a registry test now pins that.
- The same cron wrote Rio's `HACKNEY CHILDREN'S FILM FEST: Paddington &amp; Storytime`. The current cleaner already decodes the entity and drops the fest prefix; this PR adds the case as a test.
- `src/db/migrations/canonicalize-cinema-ids.ts` treated a collision as the same film id at the same time only. The cron's copies sit under dirtier film titles (`THE UNKNOWN (ON 16MM` vs `The Unknown`), so moving them would hit the `(cinema_id, source_id)` unique index. A legacy row now collides when the source id matches, or when the booking URL matches at the same instant. Colliding rows are deleted.
- A legacy cinema row left with no screenings is deleted. Every foreign key to `cinemas.id` cascades, so its scraper runs, baselines and health snapshots go with it. The dry run reports the delete that `--execute` would make.
- Title normalisation strips access parentheticals such as `(with subtitles for the D/deaf and those experiencing hearing loss)`, `(Subtitled)` and `(Audio Described)`. The real BFI IMAX scraper wrote the Disclosure Day title on 15 Oct.
- When a scraper has already set a format or event type, classification still reads subtitles, audio description, relaxed and 3D off the title.

## Impact

- New BFI IMAX scrapes store `Disclosure Day` and keep `hasSubtitles`.
- The Nickel and Rio fixes hold only once the Inngest app is archived. Running the migration before that deletes rows the cron writes back the next morning.
- Other legacy cinema ids (`close-up`, `phoenix`, `olympic`, and the rest of `legacyIds`) use the same collision rule. A shared film-page URL at two different times is still two showings.

## Production steps

1. Archive the Inngest app `pictures-london`.
2. `npm run db:migrate-cinema-ids`, read the dry run, then `npm run db:migrate-cinema-ids -- --execute`.
