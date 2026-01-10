# Phase 2: Season Scraper Research

## Overview

This research documents how London cinemas structure their season/retrospective pages online, identifying patterns for building dedicated season scrapers.

## Key Finding: Two Approaches to Seasons

### Approach 1: Dedicated Season Pages (Ideal)
Some cinemas maintain separate pages listing all films in a season/retrospective. These are the primary targets for season scrapers.

### Approach 2: Season Text in Screening Titles (Current)
The existing pipeline already extracts `season` text from individual screening titles via Claude classification (`src/scrapers/pipeline.ts:600-750`). This populates `screenings.season` as a text field.

**The Phase 4+ scrapers should complement, not replace, the existing approach** — creating proper `Season` entities that link films together.

---

## Cinema-by-Cinema Analysis

### 1. BFI Southbank (Primary Target)

**Season Page URL Pattern:**
```
https://whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=seasons
```

**Structure:**
- Main seasons listing page with cards for each active season
- Each season links to a detail page with all films
- Director seasons use naming like "David Lynch: The Dreamer", "Kubrick Season"
- Seasons include date ranges, descriptions, and poster images

**Data Available:**
- Season name and description
- Start/end dates (from page text)
- Director name (often in title or description)
- Film titles linked to the season
- Poster images

**Technical Notes:**
- Behind Cloudflare (45+ second wait required)
- Uses same `loadArticle::permalink=` pattern as film pages
- BFI PDF parser (`src/scrapers/bfi-pdf/`) already extracts season names from guide

**Example Seasons:**
- "Big Screen Classics" (ongoing repertory strand)
- "BFI Flare" (LGBTQ+ festival)
- Director retrospectives (seasonal)

---

### 2. Barbican

**Season Page URL Pattern:**
```
https://www.barbican.org.uk/whats-on/series/[series-name]
```

**Structure:**
- Series pages at `/whats-on/series/` URL pattern
- Each series has a detail page with date range and description
- Films listed as events within the series

**Data Available:**
- Series name
- Date range (e.g., "Wed 5 — Wed 26 Nov 2025")
- Description
- Film/event listings with links

**Technical Notes:**
- Static HTML, scraping-friendly
- Uses `/whats-on/[year]/event/[event-name]` for individual events
- Existing `barbican.ts` scraper uses 3-step approach (listing → detail → performances API)

**Example Series:**
- "Land Cinema" (thematic strand)
- "Colette Season" (director retrospective)

---

### 3. Prince Charles Cinema

**Season Page URL Pattern:**
```
https://princecharlescinema.com/seasons-events/[season-slug]/
```

**Structure:**
- Dedicated `/seasons-events/` section
- Each season has its own page with description and film listings
- Strong focus on cult films and audience participation events

**Data Available:**
- Season name (from page title)
- Description (from page body)
- Film listings with showtimes
- Often includes thematic groupings (Schwarzenegger Marathon, etc.)

**Technical Notes:**
- Static HTML, easy to scrape
- Existing `pcc.ts` scraper fetches `/whats-on/` — would need parallel scraper for seasons

**Example Seasons:**
- "The Films of Stanley Kubrick"
- "70mm Festival"
- Sing-along series

---

### 4. ICA (Institute of Contemporary Arts)

**Season Page URL Pattern:**
```
https://www.ica.art/films/[strand-slug]
```

**Structure:**
- Uses "strands" rather than "seasons"
- Strand pages like `/films/in-focus-[name]`
- Main `/films` page shows current films organized by strand

**Data Available:**
- Strand name
- Film listings within strand
- Director and year from colophon

**Technical Notes:**
- Existing `ica.ts` scraper fetches individual film pages
- Excludes category pages in `isExcludedUrl()` — could be modified to include them
- Strands include: "In Focus", "Long Takes", "Off-Circuit"

**Example Strands:**
- "In Focus: Chantal Akerman" (director spotlight)
- "Long Takes" (extended runtime films)

---

### 5. Close-Up Cinema

**Season Page URL Pattern:**
```
https://www.closeupfilmcentre.com/film_programmes/[year]/[season-slug]/
```

**Structure:**
- "Film Programmes" section with curated seasons
- Each season (like "Close-Up on Stanley Kubrick") has its own page
- Film URLs follow pattern: `/film_programmes/2025/close-up-on-stanley-kubrick/lolita`

**Data Available:**
- Season name
- Film titles (from embedded JSON `shows` variable)
- `film_url` field contains season path (extractable via regex)

**Technical Notes:**
- Existing `close-up.ts` scraper extracts screenings from embedded JSON
- The `film_url` field contains season information that could be parsed
- Example: `/film_programmes/2025/close-up-on-stanley-kubrick/lolita` → Season: "Close-Up on Stanley Kubrick"

**Example Seasons:**
- "Close-Up on Stanley Kubrick" (2025)
- "Close-Up on Ingmar Bergman"

---

### 6. Curzon

**Season Page URL Pattern:**
```
https://www.curzon.com/events/
```

**Structure:**
- "Events" section for special programming
- Less structured than other cinemas for seasons
- Home Cinema (streaming) has curated collections

**Data Available:**
- Limited — events are more one-off than season-based
- Streaming collections may have structure

**Technical Notes:**
- Vista API used by existing `curzon.ts` doesn't expose season groupings
- Would need HTML scraping of events page
- Lower priority for season scraping

---

### 7. Picturehouse

**Season Page URL Pattern:**
```
https://www.picturehouses.com/films/category/[category-slug]
```

**Structure:**
- Category-based filtering
- "Member Monday", "Kids Club", "Seniors" etc.
- Less explicit season structure

**Technical Notes:**
- API-based scraper doesn't return season info
- Would need additional HTML scraping
- Lower priority

---

## Existing Infrastructure to Reuse

### 1. Pipeline Season Extraction
The existing `src/scrapers/pipeline.ts` extracts seasons via Claude classification:
```typescript
// Line ~650
season: classification.season
```

This populates `screenings.season` as freeform text. Season scrapers should create proper `Season` entities that normalize this data.

### 2. Base Scraper Pattern
All scrapers extend `BaseScraper` with:
- Rate limiting (`requestsPerMinute`, `delayBetweenRequests`)
- HTML parsing (Cheerio)
- Browser support (Playwright for JS-heavy sites)

### 3. Date Parsing Utilities
`src/scrapers/utils/date-parser.ts` handles various date formats.

### 4. BFI PDF Parser
`src/scrapers/bfi-pdf/` extracts season names from monthly programme guides. Could be enhanced to create Season entities.

---

## Recommended Implementation Order

### Phase 4: BFI Season Scraper (First)
- Highest volume of seasons
- Rich data available
- Already have Playwright infrastructure for Cloudflare

### Phase 5: Additional Scrapers
1. **Close-Up** — Season info embedded in existing JSON
2. **Barbican** — Clean HTML structure
3. **Prince Charles** — Dedicated seasons section
4. **ICA** — Strand-based organization

### Lower Priority
- Curzon (less structured)
- Picturehouse (category-based, not season-based)

---

## Data Model Validation

The Phase 1 schema supports all discovered patterns:

| Field | BFI | Barbican | PCC | ICA | Close-Up |
|-------|-----|----------|-----|-----|----------|
| name | Yes | Yes | Yes | Yes | Yes |
| description | Yes | Yes | Yes | Partial | Yes |
| directorName | Yes (often) | Sometimes | Sometimes | Yes | Yes |
| startDate/endDate | Yes | Yes | Varies | No | No |
| posterUrl | Yes | Yes | Sometimes | No | No |
| sourceUrl | Yes | Yes | Yes | Yes | Yes |
| sourceCinemas | BFI | Barbican | PCC | ICA | Close-Up |

**Cross-cinema seasons are possible** — e.g., a Kurosawa retrospective at BFI + Barbican + ICA would have `sourceCinemas: ["bfi-southbank", "barbican", "ica"]`.

---

## Questions for Implementation

1. **Matching seasons across cinemas** — Should we try to detect the same director season at multiple venues? (e.g., both BFI and Barbican showing a "David Lynch" season)

2. **Season → Film linking** — How to match scraped season films to existing `films` table entries? Options:
   - Match by title + year
   - Match by TMDB ID after enrichment
   - Create new film entries if not found

3. **Historical seasons** — Should we scrape past seasons for context, or only active/upcoming ones?

---

## Next Steps

Phase 3 will create the base infrastructure:
- `BaseSeasonScraper` class extending `BaseScraper`
- Season → Film matching utilities
- Database save operations for Season entities

Phase 4 will implement the first scraper (BFI).
