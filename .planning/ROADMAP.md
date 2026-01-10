# Roadmap: Fix Scrapers and Populate February Data

## Overview

Fix 4 broken cinema scrapers and run all high-priority scrapers to populate screening data through end of February 2026.

## Domain Expertise

Cinema web scraping - HTML parsing, API integration, Playwright automation

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Diagnose & Fix Scrapers** - Found root cause (DB schema mismatch) and fixed all issues
- [x] **Phase 2: Run High-Priority Scrapers** - Executed all major chain scrapers

## Phase Details

### Phase 1: Diagnose & Fix Scrapers
**Goal**: Find and fix why 4 scrapers produce no data
**Depends on**: Nothing (first phase)
**Research**: Yes - inspected websites and traced errors
**Plans**: 1/1 complete

**Findings:**
- Root cause: Database schema missing `manually_edited` and `edited_at` columns
- Genesis: Date extraction needed to parse panel IDs instead of text
- Lexi: JSON regex needed bracket-matching instead of non-greedy pattern
- Phoenix & Castle Sidcup: Were working, just blocked by DB schema

### Phase 2: Run High-Priority Scrapers
**Goal**: Execute main chain scrapers to populate February data
**Depends on**: Phase 1
**Research**: No
**Plans**: 1/1 complete

**Results:**
| Scraper | Screenings | Venues |
|---------|------------|--------|
| Genesis | 104 | 1 |
| Lexi | 103 | 1 |
| Phoenix | 25 | 1 |
| Castle Sidcup | 66 | 1 |
| Curzon | 990 | 10 |
| Everyman | 1048 | 14 |
| Picturehouse | 1668 | 11 |
| BFI | 424 | 2 |
| Barbican | 41 | 1 |
| Electric | 60 | 1 |

## Progress

**Execution Order:**
Phases executed: 1 → 2 (consolidated from 7 planned phases)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Diagnose & Fix Scrapers | 1/1 | Complete | 2026-01-10 |
| 2. Run High-Priority Scrapers | 1/1 | Complete | 2026-01-10 |

**Milestone Status:** ✅ COMPLETE

## Final Results

- **Total future screenings**: 5,981 (up from 2,872)
- **Date coverage**: Through April 6, 2026
- **All 4 broken scrapers**: Now producing data
