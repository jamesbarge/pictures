# DocHouse duplicates and event extras stored as titles

**PR**: (this PR)
**Date**: 2026-10-23

## Changes
- Curzon Bloomsbury drops Vista titles that start with `DocHouse`. Those are the Bertha DocHouse screen inside the same building, already scraped from dochouse.org with the same showtimes. Other Curzon sites are unchanged.
- The shared title cleaner peels a hospitality lead-in before `+ <film>`, a trailing `+ … LIVE!` act, and a `(YYYY)- <event> at <Venue>` suffix. The peeled text is the screening note when the scraper did not set one. `Blacula + Ma` and `Nishi Ginza Station + My Second Brother` stay double bills.
- A listing shaped `Title, Part N: Subtitle` resolves to an existing `Title: Part I` or `Title: Part N` row that already has TMDB data or a year. No film row is created to force that spelling. `Halloween II` and `Dune: Part Two` stay on their own keys.
- `scripts/repair-listings-qa-2026-10-23.ts` rewrites stored rows. Dry-run unless `--execute`. It was not run.

## Impact
- New scrapes stop double-listing the 22 DocHouse shows and stop creating film rows for the Garden, Castle and Genesis event lines from 23 Oct 2026.
- Stored Curzon duplicates are removed only when a Bertha DocHouse screening exists at the same time. Film rows are not deleted.
