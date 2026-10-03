# Phoenix reads its full programme from the Savoy JSON blob

**PR**: TBD
**Date**: 2026-10-04

## Changes
- Root cause: Phoenix's homepage (`/whats-on/`, which redirects to `/PhoenixCinemaLondon.dll/Home`) builds its programme grid client-side, and the site's `Populate()` adds cards only while `TheNumEventsDisplayed <= 15`. The Playwright scraper discovered films from rendered `.film-title` nodes, so it saw the first 16 events by date and nothing after. On 2026-10-04 the page carried 40 events and 57 future performances running to 5 Jun 2027; the scraper returned 16 films and 32 screenings ending 18 Oct.
- The August 2026 playbook note that ~25 days was Phoenix's "site ceiling" was this cap. `scraper_runs` shows 32 to 68 screenings since July with 16 films every time. Busy multi-showing films in the first 16 push the count up, and one-off opera and NT Live nights pull it down.
- `src/scrapers/cinemas/phoenix.ts` is now a `BaseScraper` that fetches `/whats-on/` once and parses the embedded `var Events` blob with `parseSavoyEvents` from `platforms/savoy.ts`, the parser Rio already uses. Phoenix-specific clean-up: titles go through `decodeHtmlEntities(...).trim()`, directors are trimmed, `AuditoriumName` "Screen 1 Oversell" becomes "Screen 1", and screenings carry `timeSource: "local-24h"` because Savoy `StartTime` is a zero-padded 24-hour UK-local clock.
- Booking URLs: relative Savoy links (`Booking?Booking=...TcsPerformance_{id}...`) resolve against `/PhoenixCinemaLondon.dll/`, partner links (cinematik.app, eidocinema.com, japanesefilm.club) are kept, and a missing or unparseable link falls back to the event's film page with a warning, so one bad hand-typed URL cannot fail the venue.
- sourceId scheme is unchanged (`phoenix-{slug(decoded title)}-{ISO}`). A side-by-side live run matched all 32 old-scraper rows on sourceId and booking URL.
- `src/scrapers/registry.ts` and `src/config/cinema-registry.ts`: Phoenix moves from the Playwright wave to the Cheerio wave (`scraperType: "cheerio"`). Both waves share one pool; taskId, CLI alias and the `task-registry.ts` mapping are unchanged.
- Tests: new `src/scrapers/cinemas/phoenix.test.ts` covers the 40-event regression, legacy sourceIds, booking URL resolution (relative, partner, missing, malformed), BST/GMT on both sides of 25 Oct, past-show skipping, the missing-blob throw and metadata. The Phoenix case in `bst-regression.test.ts` now goes through `parsePages`.
- `SCRAPING_PLAYBOOK.md`: Phoenix section rewritten (root cause, blob fields, URL rules, horizon and validator cap); Savoy platform section and date-parser notes updated.

## Impact
- At the scraper, Phoenix coverage goes from 32 to all 57 published future performances. A persisting run should store 50: about 17 new rows, with the 31 existing scraper rows updating in place.
- 7 Met Opera and RBO broadcasts from 23 Jan to 5 Jun 2027 are rejected by the validator's 90-day cap on each run and land automatically once inside 90 days. Raising that cap for Savoy venues is a separate validator policy decision.
- One page fetch replaces a browser session plus 16 film-page navigations, which also retires the old all-or-nothing failure where one film-page timeout discarded the whole venue.
- Verified: full vitest suite (158 files, 2525 tests), eslint on changed files, `npx tsc --noEmit`.
