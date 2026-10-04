# Ibraaz gets a first-party scraper

**PR**: #782
**Date**: 2026-10-04

## Changes
- New Cheerio scraper `src/scrapers/cinemas/ibraaz.ts` for Ibraaz (Fitzrovia, W1). It reads the server-rendered `https://ibraaz.org/whats-on` listing, keeps cards tagged "Film", fetches each event page and parses its "Date and Time" line (for example `Sun 18 Oct, 3–4.30pm`).
- Film selection: "Film" must be present and every other tag must be `Library-in-Residence` or `Talk`. Across 31 archived Film events plus the live programme, those co-tags marked screenings with an intro or a conversation. `Performance`, `Workshop`, `Music` and any unseen co-tag are skipped and logged, which drops The Glass Essays performance lecture on 6 Dec.
- Dates use the shared parser: `parseScreeningDate()` for the yearless day and month (its year inference, or the explicit year when the text names one), `parseScreeningTime()` and `combineDateAndTime()` for the London start, so 3pm on 18 Oct is 14:00 UTC and 3pm on 25 Oct (the changeover Sunday) is 15:00 UTC. A range start borrows the end's am/pm unless that would put it after the end (`11–1pm` starts at 11am). The weekday in the text must match the inferred date, and any shape the parser does not recognise is skipped with a warning.
- The card `time[datetime]` and the CMS `startDate` are ignored. Editors fill their `+00:00` offset inconsistently: Foragers (3pm BST) is stored as a 4pm instant, while an archived August screening (3pm BST) is stored correctly. Ticket Tailor shows 3:00 PM for both live films checked, matching the human string.
- Booking URL is the Ticket Tailor widget link on `tickets.ibraaz.org`, falling back to the event page. `sourceId` is `ibraaz-{slug}-{ISO}`, with the slug percent-decoded from the canonical URL so accented slugs match the listing (a malformed encoding keeps the raw slug). Because the sourceId embeds the start instant, a session whose time changes gets a new row and the old one stays listed until it passes.
- The listing is read without `?category=film` because robots.txt disallows `/*?`.
- No silent zero runs: a listing with no event cards throws (Ibraaz always lists exhibitions, so that means the markup changed), and the scrape throws when more than half of the selected event pages fail, including all of them. A single failed page is skipped with a warning.
- `src/config/cinema-registry.ts`: the `ibraaz` entry moves out of the L-CUT gap-fill block and points at `cinemas/ibraaz` / `createIbraazScraper` with `scraperType: "cheerio"`.
- `src/scrapers/registry.ts`: new `scraper-ibraaz` entry in the Cheerio wave. `src/scrapers/task-registry.ts` maps `ibraaz` to it.
- `scripts/lcut-gapfill.test.ts`: the real-registry source-only set drops to 7 venues, and Ibraaz joins the report-only name checks.
- `src/scrapers/SCRAPING_PLAYBOOK.md`: new Ibraaz section (URLs, selectors, tag rule, date formats, the untrustworthy `startDate`), sourceId table row, and corrections to the 2026-08-09 note (there is a `/events-archive`, and `tickets.ibraaz.org` answers a Chrome UA with 200).

## Verification
- `src/scrapers/cinemas/ibraaz.test.ts`: 46 tests covering every date format seen on the site, the BST and GMT sides of 25 Oct, year roll-over, the weekday guard, the tag rule, listing dedupe, canonical slug decoding, booking fallback, the fetch order and failure policy (zero cards, one failed page, half, most and all failed), and registry wiring.
- Live dry parse on 2026-10-04 (no database writes): 17 events, 4 tagged Film, 3 kept. Foragers 2026-10-18 14:00Z, MILISUTHANDO 2026-10-25 15:00Z, Yugantar 2026-11-15 15:00Z, each with its Ticket Tailor URL.
- All 31 archived Film event pages parse to the London start their date string shows.
- `npm run test:run` 2565/2565, `npx tsc --noEmit -p .` clean, eslint clean on changed files.

## Impact
- Ibraaz has had 0 screenings in the database since it was added on 2026-08-09, because L-CUT lists nothing for it. The next scrape adds its film programme (3 screenings today).
- L-CUT now treats Ibraaz as report-only: if L-CUT ever lists a screening the scraper missed, it is reported as a possible scraper regression.
- To persist: `npm run scrape ibraaz`.
