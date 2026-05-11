# Fix Everyman chain scraper BST timezone bug

**PR**: TBD
**Date**: 2026-05-11

## Changes

`src/scrapers/chains/everyman.ts:458` — replaced `new Date(showtime.startsAt)` with `parseUKLocalDateTime(showtime.startsAt)`.

## The bug

Everyman's API (`/api/gatsby-source-boxofficeapi/schedule`) returns `startsAt` as a TZ-less ISO string in UK local time, e.g. `"2026-05-12T11:15:00"`. The API call passes `theaters=[{id, timeZone: "Europe/London"}]` — the API is explicitly keyed by London time.

`new Date(tzlessString)` interprets the string in the **runtime** timezone:
- Under `TZ=Europe/London` (developer Mac): correctly stored as 10:15 UTC during BST.
- Under `TZ=UTC` (cron, container, CI): incorrectly stored as 11:15 UTC — a silent +1h offset for every screening during BST.

This is the same bug class as the 11 scrapers migrated in #483, just with a different API: TZ-less ISO string parsed by `new Date()` instead of `new Date(y, m, d, h, mi)`.

## Discovery

Found via a 100-film spot-check after #483 merged:

- The check flagged 2 screenings of `Hokum` at Everyman Broadgate in the 00:00–09:59 London window (the classic BST-bug signature).
- Tracing the booking URLs showed the same screening stored twice — once at the correct evening time (scraped tonight under London TZ), once at +1h (scraped overnight at ~03:01 UTC under `TZ=UTC`).
- A repo-wide query for booking-URL duplicates at Everyman venues found **348 upcoming screenings involved in duplicate sets** — pervasive across all 15 Everyman venues.
- Picturehouse and Peckhamplex did NOT show this pattern in the same dataset.

## Verification

- `npx tsc --noEmit` clean.
- `npm run test:run src/scrapers/chains` — 4/4 pass.
- Direct API probe confirmed the no-TZ format: `startsAt: "2026-05-12T11:15:00"`.

## Impact

- **Code**: Future Everyman scrapes will store correct UTC regardless of runtime TZ.
- **Data**: The 348 existing +1h ghost rows remain in the DB. They need to be cleaned up by deleting the later-datetime row in each booking-URL pair (the correct row scraped tonight has the earlier UTC timestamp). **NOT done in this change** — destructive, requires explicit approval.

## Open follow-ups (not in this PR)

- Probe Curzon and Picturehouse chain APIs to confirm whether `startsAt` / `Showtime` fields include a TZ suffix. If they don't, those scrapers may have the same latent bug. No duplicate-pair evidence was found in the current data, but absence of evidence is not proof.
- Run the 348-row cleanup script after this PR merges.
