# Add Cinema Museum scraper via iCal feed

**PR**: TBD
**Date**: 2026-05-15

## Context

The Cinema Museum (Kennington, SE11) is an independent venue inside the former Lambeth workhouse. Mixed programming: 35mm film classics, silent screenings with live accompaniment, Kennington Bioscope evenings, talks, and lectures. Identified as Priority 2 in the 2026-05-15 London coverage audit.

## Approach

Rather than DOM-scrape the calendar page, the scraper uses the WordPress Events Calendar plugin's **public iCal feed** at `https://cinemamuseum.org.uk/schedule/?ical=1`. iCal carries structured fields (timezone-aware DTSTART, SUMMARY, URL, UID, CATEGORIES) per event — dramatically cleaner than HTML and stable across plugin UI changes.

A minimal in-tree iCal parser (`parseVEvents`) handles RFC 5545 line folding and the standard TEXT escape sequences (`\,`, `\;`, `\\`, `\n`). No npm dependency added (per project convention).

## Changes

### `src/scrapers/cinemas/cinema-museum.ts` (new)

- `parseVEvents(icalText)` — pure parser, exported for tests
- `CinemaMuseumScraper.parseICal(icalText)` — converts events to `RawScreening[]`, filters out `Tours` and `Bazaars` categories
- `fetchPages()` overrides BaseScraper's UA with `pictures-cinema-museum-scraper/1.0`. The Pressidium WAF returns 403 for browser-like Chrome UAs on the iCal endpoint but allows calendar-client UAs (Google, Apple, etc. all use generic identifiers).
- `healthCheck()` overrides for the same reason; without it the cinema would always show "unhealthy" in pre-flight.

### `src/config/cinema-registry.ts`

New cinema entry `cinema-museum` — Kennington/Lambeth, SE11 4TH, 1 screen, programming focus `silent, repertory, talks, events`.

### `src/scrapers/registry.ts`

New entry `scraper-cinema-museum` in the Cheerio wave.

### `src/scrapers/cinemas/cinema-museum.test.ts` (new)

11 unit tests against a 3-event iCal fixture (museum tour + film screening + escaped-comma talk):
- Parser extracts all VEVENT blocks, UID/SUMMARY/URL/CATEGORIES, unescapes `\,`, parses DTSTART
- Scraper filters out `Tours` category
- BST → UTC conversion (19:30 BST → 18:30 UTC on a May date)
- UID prefixed with `cinema-museum-` to namespace against other scrapers' source IDs
- Event URL preserved as bookingUrl
- Empty feed returns `[]`
- RFC 5545 line-folding (continuation lines starting with space/tab) handled correctly

## Verification

- `npx vitest run src/scrapers/cinemas/cinema-museum.test.ts` — 11/11 pass
- `npm run test:run` — 942/942 pass on the branch (931 baseline + 11 new)
- `npx tsc --noEmit` + `npx eslint <changed files>` — clean
- **Live verification against cinemamuseum.org.uk iCal feed**: 23 valid screenings parsed in ~725 ms; programme covers May–June 2026

## Impact

- Active cinema count 57 → 58 (after PR #498 also lands)
- Adds a London venue programming silent film + 35mm + Kennington Bioscope — repertory niche that's underrepresented in the existing fleet
- Demonstrates the iCal-feed pattern as a viable alternative to HTML scraping for WordPress-Events-Calendar sites (potentially reusable for other small venues)

## Follow-ups

- After landing: confirm `/scrape-one cinema-museum` works end-to-end through the pipeline and stores rows in `screenings`
- Consider extracting the `parseVEvents` parser to `src/scrapers/utils/` if another iCal-feed venue surfaces in future audits
- The Cinema Museum doesn't have visible per-event ticket URLs in the feed — booking happens via the URL field which points to the event detail page. If the project wants direct TicketLab/Eventbrite ticket URLs, that'd require an additional detail-page fetch per event (current design avoids it for simplicity)
