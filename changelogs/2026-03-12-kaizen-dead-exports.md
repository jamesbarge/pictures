# Kaizen — Remove dead exports from scraper config/venue constants

**PR**: #147
**Date**: 2026-03-12

## Changes
- Removed `export` from `COLDHARBOUR_CONFIG` in coldharbour-blue.ts (never imported)
- Removed `export` from `PECKHAMPLEX_CONFIG` and `PECKHAMPLEX_VENUE` in peckhamplex.ts (never imported)
- Removed `export` from `CASTLE_SIDCUP_CONFIG` and `CASTLE_SIDCUP_VENUE` in castle-sidcup.ts (never imported)

## Impact
- Code quality improvement, no behavior changes
- Narrowed public API surface of 3 scraper modules
- Kaizen category: dead-code
