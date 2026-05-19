# Add unit tests for src/config/cinema-registry.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/config/cinema-registry.test.ts` (new) — 20 vitest cases for the 14 exported getters.

## Coverage families
- getCinemaById: canonical lookup, undefined for unknown, legacy-ID resolution
- getCanonicalId / isLegacyId: legacy-mapping behaviour + passthrough for unknown
- Scraper-type getters: cheerio/playwright/api each return only `active === true && scraperType === ...`
- **Pinned disjointness**: no cinema appears in two scraperType buckets
- getActiveCinemas / getActiveCinemaIds: subset invariant + non-emptiness
- Chain getters: chain-filtering, active-subset invariant, independent (chain === null), getChainIds dedup
- **Pinned partition invariant**: independent + sum(chained) === total cinemas (no third state)

## Why
The cinema registry is the single source of truth for every scraper run, every map filter, every chain config. A regression that mis-buckets a cinema by scraper type or chain silently drops it from production scrapes or routes it to the wrong runner.

The "partition invariant" test is particularly load-bearing — it catches the case where a new chain value or a new "active+pending" state slips in without the union being updated.

## Changelog deferral note
Per #523-#530.
