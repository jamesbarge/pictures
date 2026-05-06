# Scraper coverage — Barbican horizon + Coldharbour category filter

**PR**: TBD
**Date**: 2026-05-06

## Changes

### `src/scrapers/cinemas/barbican.ts`

- `DAYS_AHEAD` constant bumped from 14 → 30.
- Comment updated to reflect new request count (30 pages vs 48+).

### `src/scrapers/cinemas/coldharbour-blue.ts`

- `convertToRawScreenings` filter relaxed to also accept WordPress Tribe events whose category is only `events` (not `screenings`) when the title matches a film-signal regex.
- Regex: `\b(movie night|film club|film festival|film screening)\b|\bscreening\s*[+&]`. Items already tagged `screenings` continue to pass unconditionally.

## Why

Per-cinema audit (`Pictures/Audits/scraper-coverage-2026-05-06.md`) found:

- **Barbican**: 29 upcoming screenings, all 23 in next 7 days, 29 in next 30 days — i.e. nothing past the 14-day window. Verified `https://www.barbican.org.uk/whats-on/cinema?day=YYYY-MM-DD` returns 7 cards on day 19 but 0 on day 30+, so 30-day horizon captures everything Barbican publishes.
- **Coldharbour Blue**: API returns 14 events; we kept only the 10 in the `screenings` category. Verified the missing 4 are all real film screenings tagged only as `events` by their booking system.

## Impact

- Barbican: estimated +20 screenings on next scrape (the day-15 → day-30 window).
- Coldharbour Blue: +4 screenings immediately picked up on next scrape.
- Scraper runtime: Barbican goes from ~2.3 min to ~5 min (still well within rate limits and far inside the nightly cron window). Coldharbour unchanged.
- Risk: regex was tightened after code review; verified with a 9-case test (4 expected matches + 5 false-positive guards) that "Health Screening Workshop", "Cinema Bar Quiz Night", etc. do not pass through.

## Out of scope

- **Castle Cinema / Castle Sidcup**: missing ~84 screenings combined because the scraper only parses homepage JSON-LD instead of the `/calendar/` page that has every performance button. Needs a more substantial rewrite — separate PR.
- **Regent Street Cinema**: 26 upcoming, suspected to be truncated by the scraper's 3-second post-first-batch GraphQL timeout. Needs Playwright instrumentation — separate investigation.
