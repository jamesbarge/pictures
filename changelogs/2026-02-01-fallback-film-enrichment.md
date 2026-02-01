# Fallback Film Enrichment System

**PR**: TBD
**Date**: 2026-02-01

## Changes

### Part 1: Data Quality Audit
- New CLI script `src/scripts/audit-film-data.ts` — queries DB for films missing posters, synopsis, ratings, TMDB IDs, year, directors, genres, runtime
- Outputs structured JSON + formatted terminal table, breakdown by upcoming vs historical
- New admin page at `/admin/data-quality` with summary metric cards, progress bars, and filterable gap table
- API endpoint `GET /api/admin/data-quality` serves audit data
- Added "Data Quality" nav item to admin sidebar

### Part 2: Fallback Enrichment Agent
- New agent at `src/agents/fallback-enrichment/` with 5 modules:
  - `index.ts` — main orchestrator, DB queries, apply logic
  - `web-search.ts` — Claude Haiku-powered film data extraction
  - `booking-page-scraper.ts` — OG/meta/JSON-LD extraction from booking URLs
  - `letterboxd.ts` — Letterboxd rating discovery for hard-to-match films
  - `confidence.ts` — multi-signal scoring (title match 40%, year 25%, sources 20%, completeness 15%)
- Extended `matchStrategy` type to include `'web-search-agent'`
- Auto-applies enrichment when confidence > 0.8, queues low-confidence for admin review
- Only fills empty fields — never overwrites existing data

### Part 3: Post-Scrape Integration
- CLI runner at `src/agents/fallback-enrichment/run.ts`
- NPM scripts: `npm run agents:fallback-enrich` and `npm run audit:films`
- Added `fallback` command to existing agent runner (`npm run agents fallback`)
- POST endpoint at `/api/admin/data-quality` triggers from dashboard

### Part 4: Letterboxd Integration
- Letterboxd module tries year-suffixed URLs first for disambiguation
- Year verification prevents wrong-film matches (1-year tolerance)
- Reuses same parsing approach as `src/db/enrich-letterboxd.ts`

## Impact
- Films without TMDB matches will now get posters, synopses, ratings, and metadata from web knowledge
- Admin can monitor data completeness and trigger enrichment from dashboard
- Prioritizes films with soonest upcoming screenings
- Cost-effective: uses Haiku model (~$0.0008/1K input tokens)
