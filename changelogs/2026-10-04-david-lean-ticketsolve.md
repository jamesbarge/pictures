# David Lean reads its TicketSolve XML feed

**PR**: TBD
**Date**: 2026-10-04

## Changes
- `DavidLeanScraper` is a `BaseScraper` reading `https://davidleancinema.ticketsolve.com/shows.xml` (cheerio `xml` mode). The Playwright launch, the `networkidle` wait and the innerText regexes are gone.
- Times: `date_time_iso` carries TicketSolve's UTC offset and is stored as that instant (`timeSource: "iso"`). The wall clock is re-read through `parseUKLocalDateTime()`; on a mismatch London wins, labelled `"local-24h"`.
- Availability: for future "sold out" events the scraper reads the event's own XML, stopping at the first failure or after 60s. `sold_out` needs a past `onsale_time` and 0 seats; anything else is left unset. "available" maps to `available`.
- A response with no David Lean venue throws, so a 200 challenge or maintenance page fails the venue.
- Titles keep the feed's ALL CAPS names. A trailing screening-type note moves to `eventDescription`; a relaxed note also sets `eventType: "relaxed"`. Year and runtime come from the description's stats line.
- `classifyScreening` seeds `isRelaxedScreening` from a scraper-supplied `eventType: "relaxed"`.
- `healthCheck()` HEADs the feed.

## Impact
- Dry parse 2026-10-04: 58 screenings (30 before), 4 Oct to 28 Nov, all `timeSource: "iso"`, none before 10:00 London, 31 `available`, 27 November events unset, 0 `sold_out`.
- One-off cleanup for the sourceId switch. `pipeline.ts` does not rewrite `source_id` on update, so legacy-keyed rows that Layer 1 of `checkForDuplicate` re-matches keep their old key, and rows whose title resolves differently (the ENB "PRESENTS" title, the 10 Oct "TBC" placeholder, the stale 31 Oct 20:30 Dracula copy) stay beside their replacements. Run the delete immediately BEFORE the first persist, then persist, which re-inserts all 58 under new keys. Deleting after the persist would remove about 28 valid rows until the next scrape.

  Check (read-only):
  ```sql
  SELECT s.id, s.datetime, f.title, s.source_id, s.scraped_at
  FROM screenings s JOIN films f ON f.id = s.film_id
  WHERE s.cinema_id = 'david-lean-cinema'
    AND s.datetime >= now()
    AND (s.source_id IS NULL OR s.source_id !~ '^david-lean-[0-9]+$')
  ORDER BY s.datetime;
  ```
  Cleanup, then `npm run scrape:david-lean` straight away:
  ```sql
  DELETE FROM screenings
  WHERE cinema_id = 'david-lean-cinema'
    AND datetime >= now()
    AND (source_id IS NULL OR source_id !~ '^david-lean-[0-9]+$');
  ```
  Re-run the check afterwards; it should return 0 rows.
- Still open after the persist: `cleanFilmTitle()` strips a short before-colon prefix, so "DRACULA: PRINCE OF DARKNESS" (31 Oct 20:30) resolves to Carpenter's "Prince of Darkness", as it did on 9 Sep, and "ELVIS: THAT'S THE WAY IT IS" (3 Nov) is exposed the same way. "ENGLISH NATIONAL BALLET PRESENTS THE SLEEPING BEAUTY" has no prefix rule and will not match the existing "The Sleeping Beauty" film. Both need a title-cleaner change or a manual film fix.
