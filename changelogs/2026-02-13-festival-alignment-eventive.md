# Festival Data Alignment & Eventive API Client

**Date**: 2026-02-13
**PR**: TBD

## Summary

Fixes festival data misalignment discovered after PR #113 shipped the festival scraper system, and adds structured API scraping for Eventive-based festivals (FrightFest, UKJFF).

## Phase 1: Data Alignment

### Venue ID Fixes (`seed-festivals.ts`)
Three venue IDs in seed data didn't match the cinema registry:
- `prince-charles-cinema` → `prince-charles` (FrightFest, LKFF)
- `rio-cinema` → `rio-dalston` (LSFF, EEFF)
- `genesis-cinema` → `genesis` (LKFF, EEFF)

### Missing Seed Entries
Added to `seed-festivals.ts`:
- **LIFF** (London Indian Film Festival) — slug: `liff-2026`, Jun 25–Jul 6
- **Doc'n Roll** — slug: `docnroll-2026`, Oct 28–Nov 9

### Missing Config Entries
Added to `festival-config.ts`:
- **EEFF** (East End Film Festival) — TITLE confidence, venues: genesis, rio-dalston, rich-mix
- **Sundance London** — TITLE confidence, venues: curzon-soho, picturehouse-central

### LIFF Timing Fix
Updated `typicalMonths` from `[3]` (April) to `[5, 6]` (June-July) — LIFF recently moved dates.

### Alignment Validation Test
New `alignment.test.ts` statically validates:
- Every config slugBase has matching seed entry
- Every seed festival has matching config
- All config venue IDs exist in cinema registry
- All scraped seed venue IDs use canonical registry IDs
- Every config has a watchdog probe

**Result**: 13 festivals fully aligned across config, seed, and registry.

## Phase 2: Eventive API Client

### Eventive Client (`eventive-client.ts`)
Stateless API client for `api.eventive.org`:
- `getFilms(bucketId)` — film metadata (title, directors, runtime, tags)
- `getEvents(bucketId)` — screening schedule (datetime, venue, tickets)
- `discoverEventBucket(subdomain)` — extracts bucket ID from public SPA HTML
- Optional API key via `EVENTIVE_API_KEY` env var
- 500ms rate limiting between requests

### Eventive Scraper (`eventive-scraper.ts`)
Functional pattern (festivals span multiple cinemas):
- Joins Eventive films + events → `RawScreening[]` with `cinemaId`
- Maps venue names to canonical cinema IDs (e.g., "Prince Charles Cinema" → "prince-charles")
- Detects ticket availability (available/low/sold_out)
- Maps event tags → `festivalSection`
- Logs and skips unmapped venues

**Configured festivals**:
- FrightFest: `frightfest{YY}.eventive.org`
- UKJFF: `ukjewishfilmfestival{YYYY}.eventive.org`

### Admin API
`POST /api/admin/festivals/scrape-eventive`
- Body: `{ festival: "frightfest" | "ukjff", year?: number }`
- Protected by `requireAdmin()` guard

### Inngest Cron
`scheduledEventiveScrape` — runs daily at 11:00 UTC (after venue scrapers), only scrapes festivals within their watch windows.

## Files Changed

| File | Change |
|------|--------|
| `src/db/seed-festivals.ts` | Fix 4 venue IDs, add LIFF + Doc'n Roll, export array |
| `src/scrapers/festivals/festival-config.ts` | Add EEFF + Sundance, fix LIFF months, add watchdog probes |
| `src/scrapers/festivals/festival-config.test.ts` | Update counts to 13, fix venue assertions |
| `src/scrapers/festivals/festival-detector.test.ts` | Add EEFF/Sundance mocks, fix LIFF dates |
| `src/scrapers/festivals/alignment.test.ts` | **New** — config↔seed↔registry validation |
| `src/scrapers/festivals/eventive-client.ts` | **New** — Eventive REST API client |
| `src/scrapers/festivals/eventive-scraper.ts` | **New** — festival programme scraper |
| `src/scrapers/festivals/eventive-scraper.test.ts` | **New** — 14 test cases with mocked API |
| `src/app/api/admin/festivals/scrape-eventive/route.ts` | **New** — admin API endpoint |
| `src/inngest/client.ts` | Add EventiveScraperEvent type |
| `src/inngest/functions.ts` | Add scheduledEventiveScrape cron |

## Test Results

- 29 test files, 588 tests passing
- 0 lint errors, 0 TypeScript errors
