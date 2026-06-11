# Scraper Registry Single Source

**PR:** #663

## Problem

The unified scraper CLI maintained a separate hardcoded registry with stale venue
metadata and only a subset of active scrapers. Riverside's standalone runner and
scraper also wrote to the obsolete `riverside` cinema ID while orchestration used
the canonical `riverside-studios` ID. The orchestration registry also constructed
the legacy Nickel and Rich Mix scrapers while the `scrape:nickel` /
`scrape:rich-mix` package commands ran the V2 implementations, so scheduled and
manual scrapes for those venues used different code paths.

## Changes

- Replaced the CLI's duplicate scraper definitions with entries from
  `src/scrapers/registry.ts`.
- Added canonical CLI ID derivation and backward-compatible aliases for `pcc`,
  `the-nickel`, and `phoenix-east-finchley`.
- Aligned the registry's Nickel and Rich Mix entries with the canonical
  `createNickelScraperV2` / `createRichMixScraperV2` factories used by the
  package commands, with regression tests asserting the constructed
  implementations and cinema IDs.
- Restored `FestivalDetector` tagging in the Rich Mix V2 scraper — the V1
  scraper (previously used by the orchestrator) tagged festival screenings,
  but the V2 rewrite had dropped it, so switching the registry to V2 would
  otherwise have silently removed festival tags from scheduled Rich Mix
  scrapes.
- Updated the descriptive `scraperModule`/`scraperFactory` metadata in
  `src/config/cinema-registry.ts` for both venues to reference the V2
  implementations.
- Added registry tests that enforce unique CLI IDs and aliases.
- Changed Riverside's scraper and standalone runner to use
  `riverside-studios`.
- Documented the registry as the single source of truth in the scraping
  playbook.

## Explicitly deferred

Re-pointing the ~40 `scrape:*` package commands from their standalone
`run-*.ts` runners to a generic registry runner is deferred to a follow-up.
The behavioral divergence (different scraper implementations) is fixed here;
the remaining duplication is venue-config literals inside the standalone
runners, and rewiring them needs per-command verification of chain
venue arguments.

## Verification

- `npx vitest run src/scrapers/registry.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:run`
