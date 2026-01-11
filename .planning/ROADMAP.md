# Roadmap: Director Seasons

## Overview

Build a director seasons feature that scrapes season information from London cinema websites, stores it in a structured data model, and presents it through a dedicated browse experience with director pages and calendar integration.

## Domain Expertise

Cinema web scraping — HTML parsing, API integration, Playwright automation (existing patterns in codebase)

## Phases

**Phase Numbering:**
- Integer phases (1-10): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions if needed

- [x] **Phase 1: Database Schema** — Season data model with Drizzle ✓
- [x] **Phase 2: Season Scraper Research** — Analyze cinema website structures ✓
- [x] **Phase 3: Scraper Infrastructure** — Base season scraper pattern ✓
- [x] **Phase 4: BFI Season Scraper** — First implementation ✓
- [x] **Phase 5: Additional Cinema Scrapers** — Barbican, Close-Up, PCC, ICA ✓
- [x] **Phase 6: Director Enrichment** — TMDB integration for director data ✓
- [ ] **Phase 7: /seasons Page** — Season cards and detail views
- [ ] **Phase 8: Director Pages** — Browse by director
- [ ] **Phase 9: Calendar Integration** — Seasons as filters/tags
- [ ] **Phase 10: Polish & Metadata** — Related seasons, UI refinement

## Phase Details

### Phase 1: Database Schema ✓
**Goal**: Create seasons table and relationships in Drizzle ORM
**Depends on**: Nothing (first phase)
**Research**: Unlikely (Drizzle patterns established)
**Plans**: Complete
**Completed**: 2026-01-10

Plans:
- [x] 01-01: Create seasons schema and migrations

### Phase 2: Season Scraper Research ✓
**Goal**: Document how BFI, Barbican, and other cinemas structure season data on their websites
**Depends on**: Phase 1
**Research**: Likely (external cinema websites)
**Research topics**: BFI season page structure, Barbican event series, Curzon curated collections
**Plans**: Complete
**Completed**: 2026-01-10

Plans:
- [x] 02-01: Research cinema season page structures

**Key Findings:**
- BFI: Dedicated seasons page at `whatson.bfi.org.uk/.../permalink=seasons`, Cloudflare protected
- Barbican: Series at `/whats-on/series/[name]`, clean HTML
- Prince Charles: `/seasons-events/[slug]/` dedicated section
- ICA: Strands at `/films/[strand-slug]`
- Close-Up: Season info embedded in existing JSON `film_url` field
- Implementation order: BFI → Close-Up → Barbican → PCC → ICA

### Phase 3: Scraper Infrastructure ✓
**Goal**: Create reusable base pattern for season scrapers
**Depends on**: Phase 2
**Research**: Unlikely (extending existing BaseScraper pattern)
**Plans**: Complete
**Completed**: 2026-01-10

Plans:
- [x] 03-01: Create season scraper base and utilities

**Key Deliverables:**
- `src/scrapers/seasons/types.ts` - RawSeason, RawSeasonFilm, SeasonScraperConfig types
- `src/scrapers/seasons/base.ts` - BaseSeasonScraper class with template method pattern
- `src/scrapers/seasons/pipeline.ts` - processSeasons() for saving to database with film matching
- Film matching strategies: exact title, year+title, director+title, fuzzy Levenshtein

### Phase 4: BFI Season Scraper ✓
**Goal**: Implement working season scraper for BFI (most prolific season runner)
**Depends on**: Phase 3
**Research**: Likely (BFI-specific implementation details)
**Research topics**: BFI season page selectors, date ranges, film associations
**Plans**: Complete
**Completed**: 2026-01-11

Plans:
- [x] 04-01: Implement BFI season scraper

**Key Deliverables:**
- `src/scrapers/seasons/bfi.ts` - BFISeasonScraper extending BaseSeasonScraper
- `src/scrapers/seasons/run-bfi-seasons.ts` - Manual run script
- `npm run scrape:bfi-seasons` command in package.json

**Implementation Notes:**
- Uses Playwright with stealth plugin to bypass Cloudflare protection
- Parses listing page at `permalink=seasons`, then visits each season detail page
- Extracts films using heading-first approach (h2/h3 headings followed by "Read more" links)
- Filters section headings (months, "Programme", etc.) from film results
- Successfully tested: finds season cards, extracts films, saves via pipeline

### Phase 5: Additional Cinema Scrapers ✓
**Goal**: Extend season scraping to Barbican, Close-Up, PCC, and ICA
**Depends on**: Phase 4
**Research**: Likely (per-cinema variations)
**Research topics**: Barbican event structure, Close-Up JSON, PCC seasons section, ICA strands
**Plans**: Complete
**Completed**: 2026-01-11

Plans:
- [x] 05-01: Implement additional season scrapers

**Key Deliverables:**
- `src/scrapers/seasons/close-up.ts` - Extracts from embedded JSON film_url field
- `src/scrapers/seasons/barbican.ts` - Discovers series from /whats-on/series/
- `src/scrapers/seasons/pcc.ts` - Scrapes /seasons-events/ section
- `src/scrapers/seasons/ica.ts` - Pattern matches strand pages

**npm scripts added:**
- `scrape:close-up-seasons`
- `scrape:barbican-seasons`
- `scrape:pcc-seasons`
- `scrape:ica-seasons`

### Phase 6: Director Enrichment ✓
**Goal**: Integrate TMDB for director bios, photos, and filmography data
**Depends on**: Phase 1
**Research**: Unlikely (TMDB patterns established)
**Plans**: Complete
**Completed**: 2026-01-11

Plans:
- [x] 06-01: Add TMDB director enrichment

**Key Deliverables:**
- `src/lib/tmdb/types.ts` - Added person types (TMDBPersonSearchResult, TMDBPersonDetails, TMDBPersonCredits)
- `src/lib/tmdb/client.ts` - Added person methods (searchPerson, getPersonDetails, getPersonCredits, findDirectorId, getDirectorData, getProfileUrl)
- `src/db/enrich-directors.ts` - Script to populate directorTmdbId from directorName
- `npm run db:enrich-directors` command in package.json

**Implementation Notes:**
- `findDirectorId()` prioritizes people with `known_for_department === "Directing"`
- `getDirectorData()` returns bio, filmography sorted by release date
- Enrichment script caches director lookups to avoid duplicate TMDB queries
- Rate limited to 40 requests per 10 seconds (300ms delays)

### Phase 7: /seasons Page
**Goal**: Create dedicated page for browsing all current seasons with cards
**Depends on**: Phase 4 (need data to display)
**Research**: Unlikely (internal UI patterns)
**Plans**: TBD

Plans:
- [ ] 07-01: Create seasons browse page
- [ ] 07-02: Create season detail page

### Phase 8: Director Pages
**Goal**: Create director detail pages showing their seasons and screenings
**Depends on**: Phase 6, Phase 7
**Research**: Unlikely (internal UI patterns)
**Plans**: TBD

Plans:
- [ ] 08-01: Create director pages

### Phase 9: Calendar Integration
**Goal**: Add seasons as filters/tags on existing calendar view
**Depends on**: Phase 7
**Research**: Unlikely (extending existing filter system)
**Plans**: TBD

Plans:
- [ ] 09-01: Add season filters to calendar

### Phase 10: Polish & Metadata
**Goal**: Add related seasons, refine UI, handle edge cases
**Depends on**: Phase 9
**Research**: Unlikely (refinement work)
**Plans**: TBD

Plans:
- [ ] 10-01: Polish and final refinements

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Schema | 1/1 | Complete | 2026-01-10 |
| 2. Season Scraper Research | 1/1 | Complete | 2026-01-10 |
| 3. Scraper Infrastructure | 1/1 | Complete | 2026-01-10 |
| 4. BFI Season Scraper | 1/1 | Complete | 2026-01-11 |
| 5. Additional Cinema Scrapers | 1/1 | Complete | 2026-01-11 |
| 6. Director Enrichment | 1/1 | Complete | 2026-01-11 |
| 7. /seasons Page | 0/2 | Not started | - |
| 8. Director Pages | 0/1 | Not started | - |
| 9. Calendar Integration | 0/1 | Not started | - |
| 10. Polish & Metadata | 0/1 | Not started | - |
