# Five fixes from the code review

**PR**: #827
**Date**: 2026-10-16

## Changes

- **Undefined colour tokens (frontend).** `/letterboxd`, `/search`, `/map` and `/people/[name]` referenced `--color-muted` (24 uses), `--color-foreground` (10) and `--color-background` (2). None of the three has ever been defined in `frontend/src/app.css`; they arrived with the SvelteKit rewrite (#405) and the people pages (#639). An undefined `var()` makes the declaration invalid, so the Letterboxd IMPORT button rendered with a transparent fill and all "muted" text inherited the full text colour. The uses now point at `--color-text-tertiary`, `--color-text` and `--color-bg`. Aliases in `:root` would have frozen at the undimmed values, because the house-lights dimmer writes its overrides on `<main>`. `.claude/rules/frontend.md` listed `--color-muted` as a house token and now names the real ones.
- **`seed-festivals.ts` seeded on import.** The module ended with an unconditional `seedFestivals().then(() => process.exit(0))`. `src/scrapers/festivals/alignment.test.ts` imports `londonFestivals` from it, so a test run with `DATABASE_URL` set upserted every festival into that database. The call now sits behind the `process.argv[1]?.endsWith(...)` guard used by the other scripts in `src/db/`. `npm run db:seed:festivals` goes through `seed-cli.ts` and is unaffected. `src/db/seed-festivals.test.ts` mocks the db and fails if importing calls `insert`; it fails on the old file (11 inserts) and passes on the new one.
- **Admin screening form an hour off in BST.** The `datetime-local` input showed `toISOString().slice(0, 16)`, which is UTC, and saved with `new Date(value)`, which reads the browser's own timezone. It now shows `formatUKLocalDateTime(...)` and saves `parseUKLocalDateTime(value).toISOString()`, both from `src/scrapers/utils/date-parser.ts`. `formatUKLocalDateTime` is new: the inverse of `parseUKLocalDateTime`, built on `londonParts`. A unit test covers GMT and BST and the round trip.
- **Close-Up never verified by data-check.** `CINEMA_VERIFIERS` in `scripts/data-check.ts` keyed Close-Up as `close-up`, a legacy id. Screenings use the canonical `close-up-cinema` from `src/config/cinema-registry.ts`, so the lookup missed and Close-Up rows were never sampled.

## Impact

- Visitors on the four pages see the intended inverted IMPORT button and grey secondary text, in both themes and at any dimmer position.
- Developers can run `npm run test:run` with a production `DATABASE_URL` in the environment without writing festivals.
- Admins editing a screening between late March and late October see and save the correct London time. A save gives the same instant whatever timezone the admin's machine uses.
- `/data-check` now fetches Close-Up's what's-on page for sampled Close-Up screenings. Close-Up's WAF sometimes challenges bursts of requests, which would show as `fetch_error` for that run.
