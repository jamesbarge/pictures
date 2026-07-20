# Phoenix scraper outage fix — networkidle never fires

**PR**: #734
**Date**: 2026-07-20

## Changes
- `src/scrapers/cinemas/phoenix.ts`:
  - Both `page.goto` calls switched from `waitUntil: "networkidle"` to `"domcontentloaded"`. Root cause of the 2026-07-18 outage: Phoenix's site holds analytics/tracking connections open indefinitely, so `networkidle` never fires; every navigation hit the 60s timeout, runner-factory burned all 3 retries, and `runScraper` returned `success=false` with 0 screenings. The site is server-rendered ASP.NET/Savoy `.dll` — the full programme is in the initial HTML, so `domcontentloaded` is sufficient.
  - Showtime extraction: added `.performance` to the structured-group selector (the live site renders one `<li class="performance">` per screening) and prefer `.perf-time` over the booking button's inner `.time` span (which reads "Book Now"). Each row now yields a clean date/time/absolute-booking-URL triple; the positional fallback is retained for layout drift.
  - Documented the `/whats-on/` → `/PhoenixCinemaLondon.dll/Home` 301 redirect (Playwright follows it automatically; not itself fatal).
- `src/scrapers/SCRAPING_PLAYBOOK.md`: new Phoenix Cinema section — platform, redirect, the never-networkidle rule tied to this outage, current selectors, and a future-robustness note that `/Home` embeds a Savoy modern-JSON `var Events` blob (Phoenix could migrate to `platforms/savoy.ts` like Rio and drop ~50 per-film navigations).

## Impact
- Phoenix Cinema (East Finchley) listings flow again after ~2 days of failed scrapes; the warn-flaky signal should clear over the next few runs.

## Verification
- `npm run scrape:phoenix`: success, 56 screenings found (24 added, 32 updated, 0 failed).
- DB spot-check: 72 upcoming screenings, 0 before 10:00 London (range 11:00–20:00), booking URLs are proper `.dll/Booking?...` deep-links.
- Cross-checked "Effi o Blaenau" (Mon 20 Jul 15:15) and "The Odyssey" (Mon 20 Jul 15:30) against the live site — both match.
- `npx tsc --noEmit` clean.

## Follow-up noted (not in this PR)
- A few pre-existing "The Odyssey" evening rows carry fallback `WhatsOn?f=` URLs and don't appear on the film page's current listing — possible stale rows/duplicate film record; left untouched per database rules (no deletion without confirmed parsing error).
