# Curzon chain scraper BST timezone fix

**PR**: TBD
**Date**: 2026-05-12

## Summary

Migrated `curzon.ts` from `new Date(showtime.schedule.startsAt)` to `parseUKLocalDateTime()`. This was the third and final Vista OCAPI chain scraper carrying the BST timezone bug class fixed in #484 (Everyman) and #485 (Picturehouse). 15 same-URL ghost screenings cleaned in the same change.

## Discovery path

Recommended by yesterday's spot-check report (`tasks/spot-check-2026-05-11.md`):

> "Probe Curzon and Picturehouse chain APIs for `startsAt` / `Showtime` TZ format. If they're TZ-less like Everyman, same migration applies."

Picturehouse was migrated in #485. Curzon remained vulnerable until today.

## Root cause

Vista OCAPI returns `schedule.startsAt` as a TZ-less ISO string in UK local time, e.g.:

```json
{ "schedule": { "startsAt": "2026-05-13T14:15:00" } }
```

Original code at `curzon.ts:465`:

```ts
const datetime = new Date(showtime.schedule.startsAt);
```

`new Date(tzlessStr)` interprets the string in the runtime timezone. Behaviour:

- `TZ=Europe/London` (developer Mac) → correct
- `TZ=UTC` (cron, CI, containers) → silently **+1h during BST**

Same fix class as the migrations in #483 (11 scrapers), #484 (Everyman chain), and #485 (Picturehouse chain).

## Evidence

Duplicate-pair probe (`scripts/_tmp_curzon_bst_probe.ts`) found:

- 15 candidate duplicates: same `(cinema_id, film_id)`, exactly 1 hour apart, both in the future
- **15 of 15** also shared the same `booking_url` — the definitive ghost signature
- All 15 were "The Devil Wears Prada 2" across Curzon Aldgate/Victoria/Hoxton/Kingston
- Zero 00:00–09:59 London-time outliers (the Everyman secondary signature)

The lower ghost count vs Everyman (15 vs 348) reflects that /scrape currently runs only on the developer Mac (TZ=Europe/London). The handful of ghosts likely originated from earlier Vercel cron runs before the local-only migration.

## Fix

`curzon.ts:465`:

```ts
- const datetime = new Date(showtime.schedule.startsAt);
+ const datetime = parseUKLocalDateTime(showtime.schedule.startsAt);
```

Plus the corresponding import from `../utils/date-parser`.

## Cleanup

Same script pattern as the Everyman/Picturehouse cleanups: for each `(cinema_id, film_id, booking_url)` triple with two future rows exactly 1h apart, delete the later (BST-corrupted) one.

- Dry run: 15 candidate ghosts identified
- Apply: 15 rows deleted
- Re-probe: 0 ghosts remaining

Pre-cleanup: 1314 upcoming Curzon screenings.
Post-cleanup: 1299 upcoming Curzon screenings.

## Impact

- Prevents future ghost-screening accumulation for the entire Curzon chain (10 venues)
- Removes 15 confusing duplicate listings from the user-facing calendar
- Closes out the Vista OCAPI BST bug class — all three chains (Everyman, Picturehouse, Curzon) now use `parseUKLocalDateTime` consistently

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (pre-existing warnings only, no new errors)
- `npm run test:run src/scrapers/chains` — 4/4 pass
- DB probe post-cleanup — 0/0 ghost pairs remaining

## Follow-ups

- The cleanup script lives at `scripts/_tmp_curzon_bst_cleanup.ts` for reference; safe to delete in a follow-up sweep along with `_tmp_curzon_bst_probe.ts`.
- The /data-check patrol's "broken_booking_url" cluster (9-10 per batch from a single Picturehouse tentpole URL) is a separate Picturehouse-side issue — not Curzon. Worth investigating in a follow-up: the Picturehouse scraper may be associating the same circuit-wide booking URL with multiple distinct films.
