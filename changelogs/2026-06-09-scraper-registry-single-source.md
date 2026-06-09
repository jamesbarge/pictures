# Scraper Registry Single Source

**PR:** TBD

## Problem

The unified scraper CLI maintained a separate hardcoded registry with stale venue
metadata and only a subset of active scrapers. Riverside's standalone runner and
scraper also wrote to the obsolete `riverside` cinema ID while orchestration used
the canonical `riverside-studios` ID.

## Changes

- Replaced the CLI's duplicate scraper definitions with entries from
  `src/scrapers/registry.ts`.
- Added canonical CLI ID derivation and backward-compatible aliases for `pcc`,
  `the-nickel`, and `phoenix-east-finchley`.
- Added registry tests that enforce unique CLI IDs and aliases.
- Changed Riverside's scraper and standalone runner to use
  `riverside-studios`.
- Documented the registry as the single source of truth in the scraping
  playbook.

## Verification

- `npx vitest run src/scrapers/registry.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:run`
