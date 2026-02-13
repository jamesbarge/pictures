# Festival Scraper System — Automated Festival Detection & Tagging

**PR**: TBD
**Date**: 2026-02-13

## Changes

### New Files
- `src/scrapers/festivals/types.ts` — Shared types (FestivalTaggingConfig, TaggingResult, FestivalMatch, etc.)
- `src/scrapers/festivals/festival-config.ts` — Per-festival rules for all 11 London festivals
- `src/scrapers/festivals/reverse-tagger.ts` — Batch job that tags existing DB screenings
- `src/scrapers/festivals/festival-detector.ts` — Inline detector for use during scraping
- `src/scrapers/festivals/watchdog.ts` — Programme availability monitor
- `src/scrapers/festivals/index.ts` — Public exports
- `src/scrapers/festivals/festival-config.test.ts` — Config validation tests (15 tests)
- `src/scrapers/festivals/festival-detector.test.ts` — Detector logic tests
- `src/app/api/admin/festivals/status/route.ts` — Festival status with coverage metrics
- `src/app/api/admin/festivals/reverse-tag/route.ts` — Manual reverse-tag trigger
- `src/app/api/admin/festivals/audit/route.ts` — Untagged screening audit

### Modified Files
- `src/scrapers/cinemas/bfi.ts` — Replaced hardcoded detectFestival() with shared FestivalDetector
- `src/scrapers/cinemas/barbican.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/ica.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/prince-charles.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/genesis.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/rich-mix.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/close-up.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/cine-lumiere.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/rio.ts` — Added FestivalDetector integration
- `src/scrapers/cinemas/garden.ts` — Added FestivalDetector integration
- `src/scrapers/chains/curzon.ts` — Added FestivalDetector integration
- `src/inngest/client.ts` — Added FestivalProgrammeDetectedEvent type
- `src/inngest/functions.ts` — Added scheduledFestivalReverseTag and scheduledFestivalWatchdog crons

## Architecture

Three-layer system feeding into the existing `festivalScreenings` join table:

1. **Reverse-Tagger** (batch): Runs daily at 09:00 UTC after venue scrapers complete. Queries existing screenings at festival venues during festival date windows and tags them based on confidence rules.

2. **Festival Detector** (inline): Shared utility with `preload()`/`detect()` pattern for sync use inside Cheerio `.each()` callbacks. Replaces the hardcoded BFI `detectFestival()` method.

3. **Programme Watchdog**: Runs every 6 hours. Probes festival websites for programme page availability. When detected, updates the festival record and triggers reverse-tagging.

### Confidence Strategies
- **AUTO**: FrightFest (Prince Charles), LIFF (Genesis) — exclusive venues, tag all screenings during window
- **TITLE**: All other festivals — require title keyword or booking URL pattern matching

## Impact
- Populates the mostly-empty `festival_screenings` join table automatically
- Catches festival screenings in real-time as they're scraped going forward
- No schema changes required — uses existing tables and pipeline infrastructure
- Minimal scraper changes — one import + one line per scraper
