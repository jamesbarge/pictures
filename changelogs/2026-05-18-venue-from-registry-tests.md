# Add unit tests for src/scrapers/utils/venue-from-registry.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/utils/venue-from-registry.test.ts` (new) — 7 vitest cases for `cinemaToVenue` and `getVenueFromRegistry`. Uses real registry fixtures (bfi-southbank, rio-dalston).

## Coverage
- Full field mapping (id, name, shortName, website, address tuple, features)
- **Pinned shape contract**: borough is DROPPED in conversion (CinemaDefinition has it, VenueDefinition does not)
- **Pinned null transform**: `chain: null` → `chain: undefined` via the `?? undefined` shorthand
- Features array reference preserved (identity, not copy)
- getVenueFromRegistry: returns venue for known ID, throws for missing ID, error message includes the missing ID for grep-ability

## Why
This module bridges the cinema-registry data model to the scraper runner's VenueDefinition. A shape regression silently breaks the scraper fleet — e.g. if borough leaked through, downstream code might try to use it; if features stopped propagating, the IMAX/35mm filter on the frontend would break.

The "throws with the ID in the message" test is small but meaningful — it makes production errors greppable in CloudWatch/Vercel logs.

## Changelog deferral note
Per #523-#530.
