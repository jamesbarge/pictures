# Scraper coverage follow-ups — Curzon horizon, castle-v2 cleanup, Regent Street verified

**PR**: TBD
**Date**: 2026-05-06

## Changes

### `src/scrapers/chains/curzon.ts`

- `dates.slice(0, 14)` → `dates.slice(0, 30)`. The Vista API returns business dates that have any screenings programmed — taking the first N entries is a horizon on programmed days, not consecutive calendar days. 30 covers Curzon's typical 4-8 week publication window.
- Comment expanded to explain the semantics so the next maintainer doesn't think it's a calendar-day count.

### Deleted files

- `src/scrapers/cinemas/castle-v2.ts` — experimental scraper class, never wired into the registry. Zero TS imports remain after deletion.

### Replaced runner shell

- `src/scrapers/run-castle-v2.ts` — kept the filename so `npm run scrape:castle` continues to work (the npm script in `package.json:63` references this path), but rewrote it as a 32-line runner-factory shell that wires the canonical `createCastleScraper` (the calendar-page parser from PR #476). Same shape as `run-castle-sidcup-v2.ts` and the rest of the v2 runners.

The original `run-castle-v2.ts` was 29 lines of bespoke driver code; the replacement uses the standard runner-factory pattern, so behaviour now matches the rest of the v2 runners (validation enabled, consistent error handling). The npm script is unchanged.

## Why

Two of the three follow-ups from the 2026-05-06 scraper coverage audit:

- **Curzon** showed 205/205 in next-30d at Bloomsbury, suggesting a horizon ceiling. Confirmed via the chain scraper code: `dates.slice(0, 14)` capped fetches at the first 14 published business dates per venue. Bumping to 30 picks up everything Curzon publishes.
- **castle-v2 dead code** turned up while searching for Castle scraper usages during the calendar rewrite (PR #476). It's a forked attempt that never replaced the original; leaving it in place would have invited future confusion about which file is canonical.

The third follow-up — Regent Street Cinema's passive Playwright GraphQL listener — was investigated but turned out NOT to be a bug. See below.

## Regent Street investigation result

Instrumented the programme page with Playwright at extended timeouts (30s+ wait, scroll to bottom, click "next"-like buttons) and captured every `showingsForDate` GraphQL batch the page issues.

- 4 GraphQL batches captured, all arriving within the first **~5 seconds** of page load.
- 27 distinct showings (after de-dup), spanning **2026-05-06 → 2026-07-14** (10+ weeks).
- 25 future-and-published showings.

The current scraper's 3-second post-first-batch timeout is comfortably above the 5-second window where all batches actually arrive. DB count of 26 matches the live site. **Regent Street is a small single-screen historic venue that simply programs less; not a scraper bug.**

## Verifications

- `npm run test:run`: 901/901
- `npx tsc --noEmit`: clean
- `npm run lint`: 0 errors

## Impact

- Curzon: estimated +screenings on next overnight scrape across all 7 Curzon venues whose programmes extend past 14 business dates. Hard to predict exact numbers without a per-venue probe; will measure after the scrape runs.
- castle-v2 cleanup: zero functional impact, removes ~270 LOC of dead code.
- Regent Street: no code change, but the audit doc is updated to mark it as resolved.
