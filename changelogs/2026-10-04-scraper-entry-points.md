# Every venue scrape runs through the unified CLI

**PR**: #PENDING
**Date**: 2026-10-04

## Changes
- The 26 `scrape:<venue>` scripts keep their names and now run `src/scrapers/cli.ts <id>`. Each id was checked against `getScraperByCliId` with a dry lookup (no scraping).
- `cli.ts` `runSingle` takes sub-venue args and prefixes them with the CLI id, so `npm run scrape:curzon -- soho` still scrapes `curzon-soho`. The prefixes (`curzon-`, `picturehouse-`, `everyman-`, `bfi-`, `electric-`) match the old runners' `venuePrefix` values. It exits 1 when the run reports failure.
- `scrape:all`, `scrape:chains` and `scrape:independents` run `npm run scrape -- --all|--chains|--independents`. The help text now shows the `--` that npm needs to pass a flag through.
- Deleted the 27 `src/scrapers/run-*.ts` runners plus `createMain`, `parseVenueArgs` and `runScraperForYield` from `runner-factory.ts`.
- Deleted `local-runner.ts` (`scrape:local`), `load-bfi-manual.ts` with `data/bfi-manual-screenings.json` (`load:bfi-manual`), the five `debug-*.ts` probes, `fetchWithBrowser` in `utils/browser.ts`, and the snapshot CLI (`__tests__/snapshot.ts`, `run-snapshot.ts`, four fixtures from 2026-01-02, `scrape:snapshot`).
- Deleted six unregistered scrapers: `cinemas/genesis-v2.ts` (with `scrape:genesis-basescraper`), `electric.ts`, `rich-mix.ts` (with its two BST tests), `lexi-v2.ts`, `the-nickel.ts` and `riverside-studios.ts`, plus `LEXI_VENUE` and the v1 re-exports in `electric-v2.ts` and `nickel-v2.ts`.
- `nickel-v2.ts`: the format ternary is `item.format?.toLowerCase() || "digital"` and `validate` only drops `MYSTERY MOVIE`, since `BaseScraper.validate` already dedupes by sourceId.
- Removed the AutoScrape overlay code from `base.ts` (`ConfigOverlay`, `loadConfigOverlay`, `getSelector`, `getUrl`). Barbican's three selectors are inlined. The `autoresearch_config` table holds zero `autoscrape/overlay/%` rows.
- Updated comments and playbook lines that named deleted files.

## Impact
- Manual runs and the nightly scrape build venue metadata from `cinema-registry.ts`. The runners carried their own copies, and `ensureCinemaExists` wrote them over the registry on every manual run (for example "Olympic Cinema" for Olympic Studios).
- `scrape:coldharbour-blue` now goes through `runScraper`, so a manual run gets the health check, retries and a `scraper_runs` row.
- `scrape:all` and `scrape:independents` now include jw3, bertha-dochouse, cinema-museum, chiswick and ibraaz, and carry on past a failing venue. They still exit 1 when any venue fails.
- `BaseScraper.scrape()` saves one DB query per process: the `autoresearch_config` overlay lookup is gone.
- The `scrape:local`, `load:bfi-manual`, `scrape:snapshot` and `scrape:genesis-basescraper` scripts are gone. About 8,800 lines removed.
