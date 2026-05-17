# Add Curzon Camden + Richmond + Wimbledon to cinema-registry

**PR**: TBD
**Date**: 2026-05-17

## Context

PR #513 reactivated `curzon-camden`, `curzon-richmond`, and `curzon-wimbledon` in the chain scraper config (also fixing a Wimbledon siteId typo: `WIM01` → `WIM1`). But these 3 venues were NOT in the canonical `src/config/cinema-registry.ts` — only the chain scraper config knew about them.

That's an inconsistency: every other Curzon venue (Soho, Mayfair, Bloomsbury, Aldgate, Victoria, Hoxton, Kingston) appears in both places. Without the registry entry, the DB seed pipeline and frontend `CinemaDefinition` map would have gaps for the 3 new venues.

## Changes

### `src/config/cinema-registry.ts`

- Added 3 `CinemaDefinition` entries for `curzon-camden`, `curzon-richmond`, `curzon-wimbledon`.
- Coordinates, addresses, postcodes, screen counts, and chain metadata sourced from each venue's public Curzon page.
- All `active: true` to match the chain config state.

## Verification

- `npm run test:run` — 993 / 993 pass
- `npx tsc --noEmit` — clean
- Pure data addition; no behaviour or code changes

## Impact

Brings the chain scraper config and the canonical cinema registry into full sync. The next DB seed run will create/update rows for all 3 venues; the frontend will have full metadata when those rows are read.
