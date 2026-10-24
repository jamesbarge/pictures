# Listings QA, 24 Oct 2026

**PR**: pending
**Date**: 2026-10-24

## Changes
- `cleanFilmTitleWithMetadata` strips three listing prefixes that the colon heuristic kept whole: `BFI IMAX exclusive preview:`, `Special preview:` (colon required) and `Women and the World Festival:`. `listingEventNote` copies only those prefixes into `eventDescription` when the screening has none.
- The BFI scraper drops a director that equals the raw title or contains `:` or `+`. The shared metadata parser is unchanged (draft #829 owns that guard). BFI `filmTitle` stays the prefixed string so the source id does not move.
- Garden Cinema: when one Savoy `TcsPerformance` id is emitted for two film/time pairs, the scraper reads the booking page and drops the rows that are not that film at that London time. A failed lookup keeps every row.
- `scripts/repair-listings-qa-2026-10-24.ts` moves or renames the three junk titles and deletes a Garden screening whose performance id belongs to a different film. Dry-run unless `--execute`. It was not run. The Curzon Bloomsbury / Bertha DocHouse duplicate of Traces is left for draft #837.

## Impact
- The next BFI and DocHouse scrapes store Godzilla Minus Zero, La Bola Negra and Traces under those titles, with the preview or festival label as the screening note. Godzilla Minus Zero joins the existing 2026 film. La Bola Negra is no longer credited to its own title.
- Garden no longer stores two films against one performance id. The stored Fatherland 16:00 row on 27 Oct 2026 (performance 6266328) is the extra; the booking page says that id is The Social Reckoning (15), Tuesday 27 Oct 2026, 3:45pm. The repair script deletes it only when someone passes `--execute`.
- Real colon titles stay whole: `Sundance Film Festival: The First 25 Years`, `Dracula: Prince of Darkness`, `Dune: Part Two`, `Preview`, `Special Preview of Fatherland`.
