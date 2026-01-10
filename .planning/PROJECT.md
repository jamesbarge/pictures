# Project: Fix Scrapers and Populate February Data

## Overview

Fix broken cinema scrapers and run all high-priority scrapers to populate screening data through end of February 2026.

## Core Value

Ensure users can see complete cinema listings for all London venues through end of February.

## Current State (v1.0 Shipped)

- **Total future screenings**: 5,981
- **Date coverage**: Through April 6, 2026
- **All scrapers operational**: Genesis, Lexi, Phoenix, Castle Sidcup fixed

## Requirements

### Validated

- Fix Genesis Cinema scraper (no data) — v1.0
- Fix The Lexi Cinema scraper (no data) — v1.0
- Fix Phoenix Cinema scraper (no data) — v1.0
- Fix Castle Cinema Sidcup scraper (no data) — v1.0
- Run Curzon scraper (10 venues) — v1.0
- Run Everyman scraper (14 venues) — v1.0
- Run BFI scraper (2 venues) — v1.0
- Run Barbican scraper — v1.0
- Run Electric scraper — v1.0
- Run Picturehouse scraper (11 venues) — v1.0

### Active

(None - milestone complete)

### Out of Scope

- Adding new cinemas not already in the system
- Scraper performance optimization
- UI changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fix broken scrapers first | No point running a scraper that doesn't work | Good - found DB schema issue |
| Prioritize high-traffic venues | Curzon/Everyman/BFI are most popular | Good - major venues now have data |
| Use bracket-matching for Lexi JSON | Non-greedy regex was failing | Good - 103 screenings extracted |
| Parse panel IDs for Genesis dates | Text-based date extraction unreliable | Good - 104 screenings extracted |

## Technical Context

### Scraper Types
- **Playwright**: BFI, Curzon, Everyman (JS-heavy sites)
- **Cheerio/Fetch**: Most independents (static HTML)
- **API-based**: Picturehouse, Electric (fastest)

### Fixes Applied
- Database: Added `manually_edited` and `edited_at` columns
- Genesis: Extract dates from panel IDs (`panel_20260113` → date)
- Lexi: Bracket-matching JSON extraction

### Database State (after v1.0)
- Total future screenings: 5,981
- Previously broken cinemas: 4 (all fixed)
- Date coverage: Through April 6, 2026

## Success Criteria

- [x] All 4 broken scrapers fixed and producing data
- [x] All high-priority scrapers run successfully
- [x] Screening data available through Feb 28, 2026
- [x] No regressions in working scrapers

---
*Last updated: 2026-01-10 after v1.0 milestone*
