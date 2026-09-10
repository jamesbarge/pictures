# L-CUT scraped venue aliases

**PR**: pending
**Date**: 2026-09-10

## Changes

Add five exact normalized names observed among unmapped venues in the September 9 full scrape log: Genesis Cinema (135 listings), Bertha DocHouse (49), Coldharbour Blue (16), Peckhamplex (1), BFI IMAX (1). These counts describe the captured run's listings, not verified missing screenings or current counts.

Each maps to an existing active canonical cinema with a first-party scraper. The generic British Film Institute mapping still checks both Southbank and IMAX; the explicit BFI IMAX name maps only to IMAX.

## Safety and verification

- The scheduled classifier's eight source-only targets remain unchanged. Newly mapped venues join parity monitoring, not automatic insertion.
- Five parameterized tests verify names, canonical IDs, registry activity and real scraper-registry classification.
- One real `runLcutGapfill` test supplies these five names with empty DB coverage, enables execution with the real classifier's source-only set, and confirms all five have missing-row reports but `processScreenings` is never invoked.
- External fetch/DB boundaries are mocked; no production scraping, repair or data writes were performed for this patch.

## Limits

This does not prove L-CUT is complete or accurate, fix the independent scrapers, or repair their data. The supervised CLI's existing unrestricted `--execute` behavior remains unchanged: without `--targets`, it can write for all mapped venues. Do not run it to validate this mapping patch. Automatic source-only behavior is tested separately from that broader operator command.
