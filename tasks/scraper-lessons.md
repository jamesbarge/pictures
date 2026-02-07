# Scraper Lessons

Patterns specific to cinema scraping that keep recurring.
These should eventually be promoted to CLAUDE.md rules.

## Time Parsing
- [ ] Always capture AM/PM from *surrounding* elements, not just `<time>` tags
- [x] ~~Assume PM for ambiguous hours 1-9~~ (added to CLAUDE.md)
- [ ] Validate all parsed times are 10:00-23:59; flag anything outside

## Fetch & Network
- [ ] Every `fetch()` must have a timeout via `AbortSignal.timeout()`
- [ ] Proxy retries: if ScraperAPI fails, retry once before giving up
- [ ] Detect 429 rate limits and respect `Retry-After` header

## Data Integrity
- [ ] Never delete valid future screenings during re-scrape
- [ ] BFI cancellations from Programme Changes must be applied, not skipped
- [ ] Blocked scrapes must report as failures, not successes

## Selectors & Parsing
- [ ] When a scraper returns 0 results, save raw HTML sample for debugging
- [ ] Log which CSS selectors returned empty for faster diagnosis
- [ ] Document selectors in `docs/scraping-playbook.md` when fixing scrapers
