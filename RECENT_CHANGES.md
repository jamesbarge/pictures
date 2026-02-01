# Recent Changes

<!--
AI CONTEXT FILE - Keep last ~20 entries. Add new entries at top.
When an entry is added here, also create a detailed file in /changelogs/
-->

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
