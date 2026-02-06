# Recent Changes

<!--
AI CONTEXT FILE - Keep last ~20 entries. Add new entries at top.
When an entry is added here, also create a detailed file in /changelogs/
-->

## 2026-02-06: Overlay Scrim Consistency
**PR**: TBD | **Files**: `src/app/globals.css`, `src/components/layout/header-nav.tsx`, `src/components/layout/header-nav-buttons.tsx`, `src/components/search/search-dialog.tsx`
- Added a shared `overlay-scrim` utility class for full-screen backdrop overlays.
- Updated search and navigation overlay backdrops to use the same blur/opacity treatment.
- Standardized mobile drawer scrim from `bg-black/50` to the shared scrim so modal layering feels consistent.

---

## 2026-02-04: BFI PDF-First Resilience Path
**PR**: #75 | **Files**: `src/inngest/functions.ts`, `src/scrapers/bfi-pdf/importer.ts`, `src/app/api/admin/bfi/status/route.ts`, `src/db/schema/bfi-import-runs.ts`
- Routed BFI Inngest runs through the PDF + programme-changes importer so manual/admin runs no longer depend on Playwright availability
- Added importer-level resilience diagnostics (`status`, per-source outcome, error codes) so partial-source runs return degraded success with clear failure reasons
- Added `bfi_import_runs` persistence + `/api/admin/bfi/status` endpoint for immediate ops visibility into latest BFI run health
- Added degraded/failure Slack alerts for BFI import runs so partial outages are surfaced proactively
- Fixed dedup key collisions by including screen/venue in merge key, preventing dropped simultaneous Southbank/IMAX screenings
- Updated scrape-all admin fanout to use registry-driven events, dedupe chain triggers, and queue BFI once to avoid duplicate imports
- Added tests for BFI importer resilience, BFI status endpoint, and scrape-all dedup behavior

---

## 2026-02-04: Scraper Infrastructure Consolidation
**PR**: #73 | **Files**: `src/config/cinema-registry.ts`, `src/lib/scraper-health/`, `src/db/schema/health-snapshots.ts`, `src/scrapers/run-*-v2.ts`
- Created canonical cinema registry as single source of truth for 63 cinemas
- Added health monitoring system with freshness/volume scoring and Slack alerts
- Created v2 runners for Curzon, Picturehouse, Everyman using runner-factory pattern
- Added database migration script for canonicalizing cinema IDs
- Health check cron runs daily at 7am UTC, filters only active cinemas
- New admin health API at `/api/admin/health`

---

## 2026-02-04: Fix Cinema Zero Screenings
**PR**: #65 | **Files**: `src/scrapers/cinemas/*.ts`, `src/scrapers/run-electric-v2.ts`
- Fixed all cinemas showing 0 screenings (Phoenix, David Lean, Romford Lumiere)
- Standardized cinema IDs across seed.ts and scraper configs
- Added Electric White City support with multi-venue configuration
- Phoenix: Rewrote scraper from GraphQL to DOM parsing (website changed)
- David Lean: Updated selectors for new Divi theme structure
- Romford Lumiere: Fixed title extraction from movie URLs

---

## 2026-02-02: Letterboxd Enrichment Coverage Improvements
**PR**: #64 | **Files**: `src/db/enrich-letterboxd.ts`
- Added event filtering to skip Q&As, workshops, previews etc. (wasted lookups)
- Added clean title extraction fallback for "BFI Classics: Vertigo" style titles
- Added `contentType = 'film'` filter so non-film content is excluded from queries
- Fixed auto-run side effect when importing the module

---

## 2026-02-02: Social Outreach Pipeline (Apify + Attio)
**PR**: TBD | **Files**: `scripts/social-outreach/`, `.github/workflows/social-outreach.yml`, `package.json`
- Automated weekly pipeline to find London film enthusiasts on social media
- Scrapes Instagram hashtags, TikTok, YouTube, and Reddit via Apify
- Filters for active users (recent posts, engagement thresholds, London keywords)
- Syncs contacts to Attio CRM People object with deduplication
- Runs every Sunday 10am UTC via GitHub Actions
- CLI: `npm run outreach` (full) or `npm run outreach:dry-run` (test)

---

## 2026-02-01: Fallback Film Enrichment System
**PR**: #59 | **Files**: `src/agents/fallback-enrichment/`, `src/scripts/audit-film-data.ts`, `src/app/admin/data-quality/`
- New fallback enrichment agent fills metadata gaps for films without TMDB matches
- Uses Claude Haiku + booking page scraping + Letterboxd discovery
- Confidence scoring: >0.8 auto-applies, lower queued for review
- CLI: `npm run audit:films` and `npm run agents:fallback-enrich`
- Admin dashboard at `/admin/data-quality`

---

## 2026-02-01: Allow Additional Poster Domains
**PR**: #56 | **Files**: `next.config.ts`
- Added poster host allowlist entries for non-TMDB images
- Fixes missing calendar posters for films using external sources

---

## 2026-01-31: Fix Screening Time Filtering
**PR**: #54 | **Files**: `src/app/page.tsx`, `src/app/api/screenings/route.ts`, `src/app/api/films/search/route.ts`
- Fixed critical bug where past screenings were shown until midnight
- Changed `startOfDay(now)` to `now` in public-facing queries
- Home page and API now only show screenings that haven't started yet
- A 2:00 PM screening no longer appears after 2:00 PM on that day
- Admin pages intentionally unchanged (daily stats use `startOfDay` correctly)

---

## 2026-01-19: Add Romford Lumiere Cinema
**Files**: `src/db/seed-cli.ts`, `src/scrapers/cinemas/romford-lumiere.ts`, `src/scrapers/run-romford-lumiere-v2.ts`, `package.json`
- Added Lumiere Romford as a new independent cinema
- Created Playwright-based scraper for CineSync-powered website
- Added `romford-lumiere` cinema to seed data (4 screens, community co-operative)
- Added `npm run scrape:romford-lumiere` command
- Updated `scrape:independents` to include the new scraper

---

## 2026-01-19: Fix Duplicate Films from Version Suffixes
**PR**: #51 | **Files**: `src/lib/title-extractor.ts`, `src/lib/title-extractor.test.ts`, `src/scrapers/pipeline.ts`
- Fixed duplicate film records caused by version suffixes like `: Final Cut`, `: Director's Cut`
- Added `canonicalTitle` field to separate display titles from matching titles
- "Apocalypse Now : Final Cut" and "Apocalypse Now" now correctly match to the same film
- Added VERSION_SUFFIX_PATTERNS for colon/hyphen-separated versions

---

## 2026-01-13: Add Changelog System
**Commit**: direct to branch | **Files**: `CLAUDE.md`, `RECENT_CHANGES.md`, `changelogs/`
- Added dual changelog system for AI context
- `/changelogs/` folder for detailed per-PR archives
- `RECENT_CHANGES.md` for quick AI scanning of recent work

---
