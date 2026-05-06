# Castle / Castle Sidcup — switch from homepage JSON-LD to /calendar/ parser

**PR**: TBD
**Date**: 2026-05-06

## Changes

### New files

- `src/scrapers/cinemas/castle-calendar.ts` — shared parser used by both Castle scrapers. Exports `fetchCalendarHtml`, `parseCalendarPage`, and `validateScreenings`.
- `src/scrapers/cinemas/castle-calendar.test.ts` — 14 unit tests covering the DOM contract, BST conversion, page-chrome rejection, entity decoding, validation, and template-drift detection.

### Modified

- `src/scrapers/cinemas/castle.ts` — now thin wrapper around the shared parser. Old JSON-LD types and parsing helpers removed.
- `src/scrapers/cinemas/castle-sidcup.ts` — same.
- `src/scrapers/SCRAPING_PLAYBOOK.md` — new "Castle Cinema (Hackney) and Castle Sidcup" entry covering URL pattern, selectors, BST handling, sourceId format, and the four documented pitfalls (JSON-LD horizon, in-calendar `<h1>` sensitivity, attribute-order coupling, nested-tag fragility).

## Why

Per-cinema audit on 2026-05-06 found:

- Castle Cinema (Hackney): 53 upcoming screenings, all 53 in the next 7 days.
- Castle Sidcup: 81 upcoming, all 81 in the next 7 days.

The "next 7 days = 100% of upcoming" pattern was the smoking gun. Both venues run the same Wagtail-based booking platform and publish their full programmed window at `<baseUrl>/calendar/`, but the previous scrapers used homepage JSON-LD which only renders the next ~7 days.

Verified `/calendar/` exposes every performance via `<a class="performance-button" data-perf-id="…" data-start-time="2026-05-06T16:00:00" href="/bookings/…/">`. Each button's film title is the most recent preceding `<h1>` in document order, scoped to the calendar block.

## Live smoke test (run before commit)

| Venue | Was | Now | Delta | Date range |
|---|---|---|---|---|
| Castle Cinema (Hackney) | 53 | **91** | +38 | 2026-05-06 → 2026-10-22 (23 distinct dates) |
| Castle Sidcup | 81 | **132** | +51 | 2026-05-06 → 2026-06-25 (17 distinct dates) |

BST conversion verified: `data-start-time="2026-05-06T16:00:00"` → DB `2026-05-06T15:00:00.000Z` (UK→UTC during summer).

## Robustness measures (added after code review)

- **Calendar-block scoping**: `<h1>` collection ignores anything before the first `<h3 class="date">`. A page-chrome `<h1>` (e.g. cinema name in a header) cannot be inherited by film cards. Tested: orphan-button-without-preceding-`<h1>` returns empty rather than picking up chrome.
- **HTML entity decoding**: titles like `Schindler&apos;s List` and `Tom &amp; Jerry &ndash; Big Adventure` are decoded inline. Pipeline's `cleanFilmTitleWithMetadata` handles further normalization downstream.
- **Template-drift sentinel**: if any `class="performance-button"` opening tag exists but the structured regex (requiring `class → data-perf-id → data-start-time → href`) matches zero, the parser **throws** rather than silently returning empty. A scrape failing loudly is far better than looking like a quiet day at the cinema.

## Verifications

- `npm run test:run`: 898/898 (was 887; +11 from this PR — 14 cases minus 3 pre-existing dedupe tests)
- `npx tsc --noEmit`: clean
- `npm run lint`: 0 errors
- Live smoke test against both production sites: counts and date ranges as above

## Out of scope

- `src/scrapers/cinemas/castle-v2.ts` and `src/scrapers/run-castle-v2.ts` are dead code (no live imports). Leaving them alone for a separate cleanup PR.
- Regent Street Cinema's passive Playwright GraphQL listener (third item from the audit) is a separate investigation.

## Impact

- ~89 additional screenings will appear in production after the next scheduled scrape.
- Scraper runtime per venue: 1 HTTP request, unchanged from before.
- sourceId format unchanged — existing rows in the DB will be re-matched, not duplicated.
