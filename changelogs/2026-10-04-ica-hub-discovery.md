# ICA scraper: follow season and festival hubs

**PR**: TBD
**Date**: 2026-10-04

## Changes
- `fetchPages` in `src/scrapers/cinemas/ica.ts` builds its page list from three sources: every `.item > a` tile on /films (tiles typed Live and Exhibitions included), the `.item.films` links on /upcoming (the site's own 30-day calendar), and one level of links out of hub pages. A hub is a page from either index with no performance list. Its children come from `#detail-body` and `#detail-side`, skipping links inside `<details>`, where Off-Circuit and Long Takes keep their archives.
- Links are canonicalised to `https://www.ica.art{path}` and deduped by final path segment, because ICA links one page under several paths (`/films/lff-lali` and `/films/bfi-london-film-festival-2026/lff-lali`). Booking, CMS edit, asset, calendar-day and scheme-less external links are dropped.
- A run stops at 250 page fetches, with seeds queued ahead of hub children. A failure on /films or /upcoming throws.
- `fetchUrl` already waits before every request, so the second 3s wait per page is gone and the delay drops from 3000ms to 1000ms. The live run made 147 requests in about 263s; the old scraper made 43 in about 318s.
- Titles: a `br` inside `span.title` becomes a space and whitespace runs collapse. The live page for The Night is Fading Away uses a malformed `</br>`, which produced the film "UK PREMIEREThe Night is Fading Away". Other titles keep their sourceIds, since the slug already maps each whitespace run to one dash.
- Booking: a page without a `/book/{id}` button uses its external "Book tickets" URL. LFF pages sell through `whatson.bfi.org.uk`, sometimes with a leading space inside the onclick string, and used to fall back to the ICA homepage.
- `ica.test.ts` gains 7 tests covering discovery, the page budget, index-page failure, the title fix and both booking forms. 6 of them fail against the previous scraper; the seventh pins the existing `/book/{id}` link.
- The ICA section of `SCRAPING_PLAYBOOK.md` documents the discovery sources, URL forms, booking selectors, the Spektrix API as a cross-check and the known pitfalls.

## Impact
- ICA goes from 85 to 198 screenings per run (live run without persistence, 2026-10-04). Newly captured: BFI London Film Festival screenings at the ICA, London Latino FF, the Imamura retrospective through 13 December, The Independent, Doc'n'Roll FF, NFTS Collective Visions of Pleasure, London Palestine FF, Artist's Film Picks and the Throbbing Gristle Heathen Earth screening.
- All 198 rows match a Spektrix film instance to the minute. None start before 10:00, and 188 carry year and director from the page colophon for TMDB matching.
- L-CUT coverage from the scraper's own rows rises from 81 to 144 of 147 listings, and the 3 left are the same screenings under different titles. The parity report's earlier figure of 127 counted 46 `lcut-` rows that a gap-fill run inserted on 2026-09-20.
- 25 future Spektrix film instances have no linked page on ica.art (Pereda season, LKFF 26, Pushkin House and a few one-offs). Only the Spektrix API reaches them, and it carries no director or year.
- Data to tidy after the first persisted run: 6 rows whose times ICA has changed (By Design x4, Case 137 x2), 6 rows on the malformed "UK PREMIEREThe Night is Fading Away" film, and any duplicates between the 46 `lcut-` rows and the new scraper rows.
