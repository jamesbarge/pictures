# Fix Cinema Zero Screenings

**PR**: TBD
**Date**: 2026-02-04

## Summary
Fixed all cinemas that were showing 0 screenings by addressing three root causes: duplicate cinema IDs, missing Electric White City support, and broken scrapers.

## Changes

### Phase 1: ID Standardization
- Updated `seed.ts` to use consistent short IDs matching runner-factory
- Migrated screenings from old IDs to new IDs in database
- Removed duplicate cinema records (genesis-mile-end, etc.)
- Updated scraper configs:
  - `garden-cinema` → `garden`
  - `phoenix-east-finchley` → `phoenix`
  - `olympic-studios` → `olympic`
  - `riverside-studios` → `riverside`
  - `regent-street-cinema` → `regent-street`

### Phase 2: Electric White City Support
- Converted Electric scraper to multi-venue pattern
- Added venue filtering via constructor parameter
- Updated runner to use `MultiVenueConfig` for both venues:
  - `electric-portobello` (208 Portobello Road)
  - `electric-white-city` (Westfield White City)

### Phase 3: Broken Scraper Fixes

**Phoenix Cinema (`src/scrapers/cinemas/phoenix.ts`)**
- Website completely changed from INDY Systems GraphQL to ASP.NET/DLL
- Rewrote scraper to use DOM parsing with Playwright
- Extracts films from `/whats-on/` page using `.film-title` selectors
- Navigates to each film page for showtime extraction
- Fixed date parsing with 30-day rollover threshold

**David Lean Cinema (`src/scrapers/cinemas/david-lean.ts`)**
- Website migrated to new domain with Divi theme
- Updated selectors for new DOM structure
- Extracts films from homepage slides
- Parses date/time patterns from slide content

**Romford Lumiere (`src/scrapers/cinemas/romford-lumiere.ts`)**
- Fixed title extraction from movie link URLs instead of card elements
- Simplified to direct extraction from buy-tickets page
- Uses existing stealth browser utilities for bot protection bypass

## Impact
- All London cinemas now have future screenings in the database
- Phoenix: ~100 screenings
- David Lean: ~36 screenings
- Romford Lumiere: ~25 screenings
- Electric White City: ~55 screenings (newly supported)

## Files Modified
- `src/scrapers/cinemas/david-lean.ts`
- `src/scrapers/cinemas/electric-v2.ts`
- `src/scrapers/cinemas/garden.ts`
- `src/scrapers/cinemas/olympic.ts`
- `src/scrapers/cinemas/phoenix.ts`
- `src/scrapers/cinemas/regent-street.ts`
- `src/scrapers/cinemas/riverside-v2.ts`
- `src/scrapers/cinemas/romford-lumiere.ts`
- `src/scrapers/run-electric-v2.ts`
