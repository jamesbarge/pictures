# Recent Changes

<!--
AI CONTEXT FILE - Keep last ~20 entries. Add new entries at top.
When an entry is added here, also create a detailed file in /changelogs/
-->

## 2026-02-04: Fix Cinema Zero Screenings
**PR**: TBD | **Files**: `src/scrapers/cinemas/*.ts`, `src/scrapers/run-electric-v2.ts`
- Fixed all cinemas showing 0 screenings (Phoenix, David Lean, Romford Lumiere)
- Standardized cinema IDs across seed.ts and scraper configs
- Added Electric White City support with multi-venue configuration
- Phoenix: Rewrote scraper from GraphQL to DOM parsing (website changed)
- David Lean: Updated selectors for new Divi theme structure
- Romford Lumiere: Fixed title extraction from movie URLs

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
