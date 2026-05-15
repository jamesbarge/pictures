# Add Bertha DocHouse scraper

**PR**: TBD
**Date**: 2026-05-15

## Context

The 2026-05-15 London coverage audit (in `Pictures/Audits/` in the Obsidian vault) identified **Bertha DocHouse** as the top-priority London independent cinema not yet covered by `/scrape`. It is the UK's only year-round documentary cinema, lives physically inside Curzon Bloomsbury, but operates with its own programming, branding, and event detail pages — separate from the Curzon chain scraper's outputs.

## Changes

### `src/scrapers/cinemas/bertha-dochouse.ts` (new)

Cheerio-based scraper, 2-step list-then-detail pattern:

1. Walk `/whats-on/`, `/whats-on/page/2/`, ... up to a 10-page cap. Extract every `/event/<slug>/` anchor; dedupe via a `Set`. Stops early when a page yields no new URLs or returns an HTTP error.
2. For each event detail URL, fetch the page and parse the "Screening times and booking" anchors. Each anchor is a `<a href="https://www.curzon.com/ticketing/seats/BLO1-XXXXXX">Fri 15th May 16:30</a>` — title is the page's `<h1>`, datetime is parsed via existing `parseScreeningDate` + `parseScreeningTime` utilities, and the `BLO1-XXXXXX` ticket ID becomes `sourceId` (prefixed `bertha-` to avoid collision with Curzon's own scraper).

`parsePages` pins the reference date to start-of-day UTC before calling `parseScreeningDate` — necessary because the parser's "no-year, in-past → +1 year" rule compares full Date timestamps and would otherwise bump same-day screenings into 2027.

### `src/config/cinema-registry.ts`

New cinema entry `bertha-dochouse` — Bloomsbury, WC1, 1 screen, documentary programming, `chain: null`, references the scraper module + factory.

### `src/scrapers/registry.ts`

New entry `scraper-bertha-dochouse` in the Cheerio wave.

### `src/scrapers/cinemas/bertha-dochouse.test.ts` (new)

9 unit tests against a representative HTML fixture covering:
- Multi-screening extraction (3 entries from the fixture)
- Title extraction from `<h1>`
- `sourceId` derivation from the ticket ID
- Curzon booking URL preservation
- "Fri 15th May 16:30" → 2026-05-15T15:30:00Z (BST → UTC)
- Filtering out non-Bertha ticket URLs (`SOH1-XXXXX` etc.)
- Defensive returns ([] when no `<h1>`, [] when anchor has no parseable time)
- Today-edge-case regression: pinned start-of-day reference date keeps today's screening in the current year

## Verification

- `npx vitest run src/scrapers/cinemas/bertha-dochouse.test.ts` — 9/9 pass
- `npm run test:run` — 940/940 pass on the branch (931 baseline + 9 new)
- `npx tsc --noEmit` — clean
- `npx eslint <changed files>` — clean
- **Live verification against dochouse.org**: scrape returned 43 valid screenings across 21 events in ~20 s; all dates in 2026; covers programme through 7 June 2026

## Impact

- Adds first new London independent cinema since the 2026-05-04 architectural rethink. Coverage: 56 → 57 active cinemas.
- Documentary niche is high-value but underserved by the existing programme — likely to surface new repertory-style events ("Newsreel Retrospective", "Landmarks") that wouldn't otherwise show up on the calendar.

## Follow-ups (next session)

- Cinema Museum (Kennington) — Priority 2 in the audit
- Re-audit inactive Curzon/Everyman DB rows (`curzon-camden`, `curzon-richmond`, `curzon-wimbledon`, `everyman-walthamstow`) to confirm they're truly defunct
- Castle Catford (was Catford Mews) once it reopens later in 2026
