# Add Everyman Brentford + Whiteley

**PR**: TBD
**Date**: 2026-05-17

## Context

The 2026-05-15 London coverage audit identified two newly-opened Everyman venues that were missing from the chain config: **Everyman Brentford** (opened 2024) and **Everyman at The Whiteley** in Bayswater (opened 2025). Both are real, operating venues with live programming.

## Approach

The Everyman scraper is a chain scraper that fans out via a `THEATER_IDS` map keyed by URL slug, then calls the same API endpoint per venue (`/api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=<ID>`). Adding new venues is purely a data change — no scraper code modifications.

## Live verification

```
curl https://www.everymancinema.com/api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=G049A
→ HTTP 200 with real screening data for Brentford

curl https://www.everymancinema.com/api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=G05D7
→ HTTP 200 with real screening data for The Whiteley
```

## Changes

### `src/scrapers/chains/everyman.ts`

- Added two entries to `THEATER_IDS`: `"brentford": "G049A"`, `"the-whiteley": "G05D7"`.
- Added two entries to `EVERYMAN_VENUES`: `everyman-brentford` and `everyman-the-whiteley` with addresses, postcodes, and features.

### `src/config/cinema-registry.ts`

- Two new `CinemaDefinition` entries (id `everyman-brentford` and `everyman-the-whiteley`) so the canonical cinema registry, DB seed, and frontend all know about them.

## Verification

- `npm run test:run` — 982 / 982 pass on the branch
- `npx tsc --noEmit` — clean

## Impact

Active cinema count: 58 → 60. Brentford fills a West London coverage gap; The Whiteley adds a 5-screen venue in Bayswater. The Everyman chain scraper will pick them up on its next run.
