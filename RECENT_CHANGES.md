# Recent Changes

<!--
AI CONTEXT FILE - Keep last ~20 entries. Add new entries at top.
When an entry is added here, also create a detailed file in /changelogs/
-->

## 2026-03-12: Kaizen — Clean up sync service console.log noise
**PR**: #164 | **Files**: `user-sync-service.ts`, `festival-sync-service.ts`
- Promoted 2 "not authenticated" messages to `console.warn`
- Removed 6 success `console.log` calls (already tracked via PostHog, noise in browser console)
- Kaizen automated refactoring (category: console-cleanup)

---

## 2026-03-12: Kaizen — Standardize error handling in festival follows and calendar routes
**PR**: #163 | **Files**: `festivals/follows/[festivalId]/route.ts`, `calendar/route.ts`
- Replaced 3 manual catch blocks with `handleApiError` (2 in festival follows, 1 in calendar)
- Removed unused `unauthorizedResponse` import from festival follows route
- Kaizen automated refactoring (category: error-handling)

---

## 2026-03-12: Kaizen — Replace remaining inline cache headers with shared constants
**PR**: #162 | **Files**: `films/search/route.ts`, `festivals/route.ts`, `festivals/[slug]/route.ts`, `search/route.ts`
- Replaced 5 inline Cache-Control strings with `CACHE_5MIN`, `CACHE_10MIN`, `CACHE_2MIN` from `cache-headers.ts`
- Completes migration started in PR #155 — all API routes now use shared constants
- Kaizen automated refactoring (category: extract-constant)

---

## 2026-03-12: Kaizen — Group imports by external/internal/relative
**PR**: #161 | **Files**: `verification.ts`, `screening-card.tsx`, `film-card.tsx`
- Separated external package imports from internal `@/` imports with blank lines
- Alphabetized imports within each group
- Kaizen automated refactoring (category: import-organization)

---

## 2026-03-12: Kaizen — Rename cryptic single-letter variables
**PR**: #160 | **Files**: `cleanup.ts`, `browser.ts`, `scrape-all.ts`
- Renamed `t` → `normalized` in BFI title normalize function (8 occurrences)
- Renamed `b` → `activeBrowser` to avoid shadowing module-level `browser` singleton
- Renamed `arr` → `items` in generic `chunk()` utility
- Kaizen automated refactoring (category: naming)

---

## 2026-03-12: Kaizen — Add JSDoc to rate-limit and gemini exports
**PR**: #159 | **Files**: `rate-limit.ts`, `gemini.ts`
- Added JSDoc to 6 exported symbols missing documentation (interfaces, types, constants)
- Converted `//` field comments to `/** */` for IDE tooltip visibility
- Kaizen automated refactoring (category: jsdoc)

---

## 2026-03-12: Kaizen — Extract shared buildChainConfig helper
**PR**: #158 | **Files**: `venue-from-registry.ts`, `curzon.ts`, `picturehouse.ts`, `everyman.ts`
- Extracted duplicated `buildConfig()` from 3 chain trigger files into shared `buildChainConfig` helper
- Reuses existing `cinemaToVenue` mapping, eliminating ~45 lines of copy-pasted code
- Kaizen automated refactoring (category: duplicate-pattern)

---

## 2026-03-12: Kaizen — Promote failure-condition logs to console.warn
**PR**: #157 | **Files**: `posters/service.ts`, `scraper-health/alerts.ts`, `event-classifier.ts`
- Promoted 5 `console.log` calls to `console.warn` where they report failure conditions or missing config
- Kaizen automated refactoring (category: console-cleanup)

---

## 2026-03-12: Kaizen — Standardize error handling in user API routes
**PR**: #156 | **Files**: `user/route.ts`, `user/preferences/route.ts`, `user/film-statuses/route.ts`, `user/film-statuses/[filmId]/route.ts`
- Migrated 7 catch blocks from manual `console.error` + `NextResponse.json` to shared `handleApiError`
- Removed `unauthorizedResponse` imports (now handled by `handleApiError`)
- Kaizen automated refactoring (category: error-handling)

---

## 2026-03-12: Kaizen — Extract shared Cache-Control header constants
**PR**: #155 | **Files**: `cache-headers.ts`, `screenings/route.ts`, `cinemas/route.ts`, `cinemas/[id]/route.ts`, `films/[id]/route.ts`
- Created `src/lib/cache-headers.ts` with named constants for 3 cache tiers (2min, 5min, 10min)
- Replaced duplicated local `CACHE_HEADERS` definitions in 4 API routes with shared imports
- Kaizen automated refactoring (category: extract-constant)

---

## 2026-03-12: Kaizen — Organize imports in API route files
**PR**: #154 | **Files**: `films/search/route.ts`, `search/route.ts`, `user/import-letterboxd/route.ts`
- Grouped imports: external packages first, then `@/` aliases, separated by blank lines
- Alphabetized external packages within their group
- Kaizen automated refactoring (category: import-organization)

---

## 2026-03-12: Kaizen — Rename remaining catch (e) to catch (error) across codebase
**PR**: #153 | **Files**: `seasons/close-up.ts`, `classify-events.ts`, `posthog-server.ts`, `film-similarity.ts`
- Renamed `catch (e)` to `catch (error)` in 3 files, removed unused catch binding in 1 file
- Eliminates all remaining `catch (e)` instances in the codebase
- Kaizen automated refactoring (category: naming)

---

## 2026-03-12: Kaizen — Add JSDoc to filter-constants.ts exports
**PR**: #152 | **Files**: `src/lib/filter-constants.ts`
- Added JSDoc to 10 exported constants and functions (DECADES, COMMON_GENRES, FORMAT_OPTIONS, TIME_PRESETS, 6 helper functions)
- Converted 3 inline `//` comments to proper `/** */` JSDoc format
- Kaizen automated refactoring (category: jsdoc)

---

## 2026-03-12: Kaizen — Move sourceId dedup into BaseScraper.validate()
**PR**: #151 | **Files**: `base.ts`, `rich-mix-v2.ts`, `electric-v2.ts`, `riverside-v2.ts`, `castle-v2.ts`
- Moved sourceId deduplication from 4 identical v2 scraper overrides into `BaseScraper.validate()`
- Eliminates ~40 lines of copy-pasted code across scraper files
- Kaizen automated refactoring (category: duplicate-pattern)

---

## 2026-03-12: Kaizen — Promote failure console.log to console.warn in scrapers
**PR**: #150 | **Files**: `close-up.ts`, `rich-mix-v2.ts`, `rich-mix.ts`, `rio.ts`, `fetch-with-retry.ts`
- Promoted `console.log` to `console.warn` for 7 error/failure messages across 5 scraper files
- Fixed `catch (e)` → `catch (error)` in close-up.ts (missed in previous error-handling pass)
- Kaizen automated refactoring (category: console-cleanup)

---

## 2026-03-12: Kaizen — Standardize catch variable naming in scraper utils
**PR**: #149 | **Files**: `src/scrapers/utils/{veezi-scraper,film-matching,screening-classification}.ts`
- Renamed `catch (e)` to `catch (error)` across 5 catch blocks to match project convention
- Kaizen automated refactoring (category: error-handling)

---

## 2026-03-12: Kaizen — Extract shared User-Agent constants for scrapers
**PR**: #148 | **Files**: `src/scrapers/constants.ts`, `src/scrapers/cinemas/{the-nickel,lexi,genesis,castle}.ts`
- Created `CHROME_USER_AGENT` and `BOT_USER_AGENT` constants, replaced inline strings in 4 scrapers
- Kaizen automated refactoring (category: extract-constant)

---

## 2026-03-12: Kaizen — Remove dead exports from scraper config/venue constants
**PR**: #147 | **Files**: `src/scrapers/cinemas/coldharbour-blue.ts`, `src/scrapers/cinemas/peckhamplex.ts`, `src/scrapers/cinemas/castle-sidcup.ts`
- Removed `export` from 5 constants (CONFIG/VENUE) that were never imported outside their own files
- Kaizen automated refactoring (category: dead-code)

---

## 2026-03-12: Kaizen — Replace `as any` with proper AlertType in scraper health
**PR**: #146 | **Files**: `src/lib/scraper-health/index.ts`
- Extracted `AlertType` union type, replaced `string | null` with `AlertType | null`, removed `as any` and `as HealthAlert["alertType"]` casts
- Kaizen automated refactoring (category: type-safety)

---

## 2026-03-12: Kaizen — Remove unused imports in scraper files
**PR**: #145 | **Files**: `src/scrapers/cinemas/cine-lumiere.ts`, `src/scrapers/cinemas/phoenix.ts`, `src/scrapers/cinemas/romford-lumiere.ts`, `src/scrapers/utils/browser.ts`, `src/scrapers/utils/date-parser.test.ts`
- Removed unused imports (`addYears`, `parse`, `BrowserContext`, `vi`, `beforeEach`) and unused interfaces (`FilmPerformance`, `PhoenixFilm`, `CineSyncShowtime`)
- Kaizen automated refactoring (category: lint-fix)

---

## 2026-03-11: Fix Duplicate Screenings at Same Cinema/Time
**Branch**: `data-loop` | **Files**: `src/scrapers/pipeline.ts`, `src/scrapers/utils/screening-classification.ts`, `src/scrapers/cli.ts`, `scripts/merge-nickel-cinemas.ts`
- Root cause: CLI registered The Nickel as `id: "nickel"` while scraper config used `cinemaId: "the-nickel"`, creating two cinema records with parallel screenings
- Fixed CLI entry to use `the-nickel` and reference `NICKEL_VENUE` config directly
- Merged 47 duplicate screenings from `nickel` → `the-nickel` and deleted stale cinema record
- Added `normalizeTimestamp()` in pipeline.ts to zero seconds/ms on all screening timestamps (prevents future sub-minute drift)
- Added Layer 1.5 to `checkForDuplicate()` with ±2min time-window dedup + widened Layer 2 to ±2min window
- Diagnostic/cleanup scripts for near-duplicate screening detection

---

## 2026-03-08: QA Cleanup Agent — Daily Front-End Verification Pipeline
**Branch**: `feat/qa-cleanup-agent` | **Files**: `src/trigger/qa/*`, `src/app/api/admin/qa/route.ts`, `src/agents/types.ts`, `src/trigger/utils/alert-tiers.ts`
- New daily QA pipeline (6am UTC): browses pictures.london with Playwright, compares against DB, auto-fixes discrepancies
- 3-task architecture: `qa-browse` (Playwright extraction) → `qa-analyze-and-fix` (DB comparison + Gemini analysis + auto-fix) → Telegram report
- Detects: stale screenings, broken booking links, TMDB mismatches, missing Letterboxd ratings, time mismatches
- Scope classification: spot issues vs systemic patterns (e.g., all BFI links broken → cinema-level critical alert)
- Double-check verification gate before all DB writes (TMDB cross-reference, UNIQUE constraint check)
- Gemini-powered prevention report with specific code/config recommendations
- DRY_RUN=true by default for safe rollout; admin API at POST /api/admin/qa for on-demand triggers
- Split orchestrator into `qaPipeline` (regular task, API-triggerable) + `qaOrchestrator` (cron wrapper) for reliable dispatching
- Made audit trail (`insertAuditRecord`) non-fatal so DB issues don't crash the pipeline
- Created missing `data_issues` table in production Supabase

---

## 2026-03-07: Fix BST Timezone Offset & AI Hallucination Guard
**Branch**: `fix/scraper-logs` | **Files**: `src/scrapers/utils/date-parser.ts`, `src/lib/title-extraction/ai-extractor.ts`, `src/lib/title-extraction/patterns.ts`, `src/scrapers/utils/film-title-cleaner.ts`, 7 cinema scrapers
- Fixed BST timezone offset: screenings in BST dates showed 1 hour ahead because scrapers used `new Date(year, month, day)` (server local = UTC on Trigger.dev). Changed all date construction to `Date.UTC()` + `ukLocalToUTC()` for correct UTC storage.
- Added `lastSundayOfMonth()`, `isUKSummerTime()`, `ukLocalToUTC()` to date-parser for dynamic BST boundary detection.
- Added AI hallucination guard: `hasWordOverlap()` rejects Gemini output with <30% word overlap (prevents "Slayer Part Two" from "Dune: Part Two").
- Added `dune` to franchise patterns (`FRANCHISE_PATTERN` + `isFilmSeries`) and `part` to subtitle patterns.
- Fixed 7 scrapers: arthouse-crouch-end, rio, garden, phoenix, olympic, david-lean, romford-lumiere.

---

## 2026-03-05: Fix Orchestrator Batch Counting & Queue Contention
**Branch**: `fix/orchestrator-batch-and-chunking` | **Files**: `src/trigger/scrape-all.ts`, `src/agents/fallback-enrichment/letterboxd.ts`
- Replaced `Promise.allSettled(map(triggerAndWait))` with SDK's `batch.triggerAndWait()` — fixes massive undercounting (reported 4/31 succeeded vs actual 23/31)
- Chunked Playwright (batches of 4) and Cheerio (batches of 6) waves to prevent queue contention timeouts (8 tasks had durationMs=0)
- Bumped orchestrator `maxDuration` from 3600→5400 (90 min) to accommodate sequential chunking
- Fixed fallback Letterboxd regex to match "X.XX out of 5 stars" format (was only matching "out of 5")

---

## 2026-03-05: Letterboxd Watchlist Import
**Branch**: `feature/letterboxd-import` | **Files**: `src/lib/letterboxd-import.ts`, `src/app/api/letterboxd/preview/route.ts`, `src/app/api/user/import-letterboxd/route.ts`, `src/trigger/enrichment/letterboxd-import.ts`, `src/components/watchlist/letterboxd-import.tsx`, `src/components/watchlist/letterboxd-import-trigger.tsx`, `src/components/watchlist/watchlist-view.tsx`, `src/app/letterboxd/page.tsx`
- Users enter a Letterboxd username to see which watchlist films are screening in London
- Core scraper with Cheerio parsing, pagination, rate limiting, 500-entry cap
- Film matching against local DB with title normalization and year ±1 tolerance
- Screening enrichment with next-screening, count, and "last chance" badges
- Preview API (unauthenticated) + import API (authenticated) with batch upsert
- Trigger.dev background task for TMDB lookup of unmatched entries
- 4-state UI component (idle/scraping/results/error) with PostHog analytics
- Landing page at /letterboxd with dynamic stats
- In-memory cache (1hr TTL, 50 entries max) for repeat lookups
- 44 new unit tests (733 total, all passing)

---

## 2026-03-05: Post-First-Run Trigger.dev Fixes
**Branch**: `fix/curzon-api-domain-migration` | **Files**: `src/scrapers/base.ts`, `src/db/enrich-letterboxd.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`
- Health check: changed HEAD→GET with real browser User-Agent (fixes Close-Up and Olympic 0-result failures)
- Letterboxd enrichment: added failure-reason logging (slug_404, year_mismatch, no_rating_meta, etc.) to diagnose 78/82 failures
- BFI programme changes: added full browser headers (Sec-Fetch-*, Accept-Encoding, etc.) to fix 403 from cloud worker IPs

---

## 2026-03-04: Fix Trigger.dev Production Deploy
**Commits**: `c8bdfc4`, `9a0ed6f` | **Branch**: `main` (direct) | **Files**: `package-lock.json`, `src/config/cinema-registry.ts`, `src/inngest/known-ids.ts`
- Fixed `npm ci` failure: regenerated lockfile with npm 10 to include `magicast@0.3.5` nested peer dep
- Added `regent-street` cinema to canonical registry (was in seed data but missing from registry, causing Trigger.dev indexer crash)
- Added `regent-street` to Inngest known-ids for test coverage
- All 28+ tasks now deployed to Trigger.dev production

---

## 2026-03-04: Scraper Consolidation — Trigger.dev Migration
**PR**: #135 | **Branch**: `feat/trigger-dev-migration` | **Files**: `src/trigger/**`, `trigger.config.ts`, `src/lib/gemini.ts`, `src/config/feature-flags.ts`, `src/agents/types.ts`, admin routes, GH Actions
- Consolidated 28 scrapers (59 venues) from Inngest + GH Actions + Manual CLI onto Trigger.dev
- Created `src/trigger/` with task wrappers for all independent, chain, and enrichment scrapers
- Added Playwright build extension for browser-based scrapers running in containers
- Added AI verification system using Gemini Flash Lite for post-scrape data quality checks
- Wired `verifyScraperOutput()` into all 28 task files via `runScraperAndVerify()` wrapper
- Added tiered alerting: P1 (immediate Telegram for chain/orchestrator failures), P2 (single scraper), P3 (warnings)
- Created `scrape-all-orchestrator` with 4-wave execution: chains → Playwright → Cheerio → Enrichment
- Replaced hardcoded venue metadata in 24 independent tasks with `getCinemaById()` from cinema-registry
- Fixed Gemini `responseJsonSchema` field mapping (was using wrong SDK config key)
- Fixed `storeVerification()` race condition (now uses `scraperRunId` directly instead of latest-by-cinema)
- Feature-flagged admin routes: `ORCHESTRATOR=trigger.dev` env var switches from Inngest
- Extended `gemini.ts` with multi-model support (pro + flashLite) and JSON schema constraints
- Extended `DataIssueType` with 9 new verification-specific issue types
- Added admin route test coverage for Trigger.dev dispatch path
- Disabled GH Actions schedule crons (kept `workflow_dispatch` as emergency fallback)
- CI deployment via `.github/workflows/deploy-trigger.yml`

---

## 2026-03-03: Run All Playwright Scrapers Even If One Fails
**PR**: #134 | **Branch**: `fix/playwright-scraper-step-resilience` | **Files**: `.github/workflows/scrape-playwright.yml`
- Added `continue-on-error: true` to chain and independent scraper steps so one failure no longer skips remaining scrapers
- Added explicit end-of-job outcome checks that fail the job if any scraper step failed, preserving alerting and red status
- This fixes the March 3 manual run behavior where Curzon failure caused Picturehouse and Everyman to be skipped entirely

---

## 2026-03-03: Fix Playwright Scraper Workflow Timeout
**PR**: #133 | **Branch**: `fix/playwright-scrape-timeout` | **Files**: `.github/workflows/scrape-playwright.yml`
- Investigated manual dispatch run on March 3, 2026 and confirmed `Scrape Chain Cinemas` was cancelled at the 60-minute job timeout while `Scrape Picturehouse` was still running
- Increased chain job timeout from 60 to 120 minutes so Curzon + Picturehouse + Everyman can complete in one run
- Added per-step timeouts for chain scrapers to keep bounded failure behavior without cancelling the whole job too early

---

## 2026-02-12: Festival Data Audit & Corrections
**PR**: #110 | **Branch**: `fix/festival-data-audit` | **Files**: `src/db/seed-festivals.ts`, `src/scrapers/festivals/festival-config.ts`, `src/scrapers/festivals/festival-config.test.ts`
- Deactivated defunct festivals (Sundance London, EEFF), corrected 2026 festival metadata, and aligned venue IDs with canonical cinema registry slugs
- Added missing festival entries used by current detection/tagging flow and exported `londonFestivals` for config↔seed alignment tests
- Updated festival config/test expectations to the current active festival set and matching watchdog probes

---

## 2026-02-28: Front-End Audit Scripts + Data Fix Tooling
**PR**: #123 | **Branch**: `chore/audit-scripts-and-changelogs` | **Files**: `scripts/audit/*`, `scripts/fix-*.ts`, `scripts/merge-duplicate-films.ts`, `.gitignore`
- Added Playwright-based audit pipeline for cinemas, films, and screenings with structured report generation
- Added one-off remediation scripts for title mismatches, contaminated booking URLs, non-film content cleanup, and duplicate film merges
- Added archived changelog entry documenting the 897→624 issue-reduction run and remaining known gaps
- Updated `.gitignore` to ignore generated audit output/artifacts from script runs

---

## 2026-02-15: Upgrade Node.js from 20 to 22 LTS
**PR**: #116 | **Branch**: `chore/upgrade-node-22` | **Files**: `.nvmrc`, `package.json`, `package-lock.json`, `.github/workflows/{test,scrape,scrape-playwright,social-outreach}.yml`
- Upgraded project runtime baseline to Node 22 LTS and pinned local dev with `.nvmrc`
- Updated CI/scrape/social workflow Node versions from 20 to 22 for consistent environments
- Updated PostHog packages and lockfile; raised `@types/node` to `^22` to align with runtime/tooling
- Addresses PostHog engine requirements (`^20.20.0 || >=22.22.0`) and reduces environment drift

---

## 2026-03-03: Fix Weekly Cinema Scrape Timeout (8 weeks broken)
**Branch**: `fix/scraper-process-exit` | **Files**: `src/scrapers/runner-factory.ts`
- Scraper processes completed work but never exited — postgres.js connection pool kept Node.js event loop alive
- Every GitHub Actions step burned its full timeout (5-20 min), cumulative ~135 min exceeded 120-min job limit
- 8 consecutive weekly runs cancelled since Jan 11; last success was Jan 4
- Added `process.exit(0)` to success path in `createMain()` (mirrors existing `process.exit(1)` on failure)
- One-line fix affects all 27 scrapers via shared runner factory

---

## 2026-03-01: Enable Google Search Console + Bing Webmaster Tools
**Branch**: `feature/enable-search-console` | **Files**: `src/app/layout.tsx`, `.env.local.example`
- Uncommented and wired `verification` metadata block in root layout to emit `<meta name="google-site-verification">` and `<meta name="msvalidate.01">` tags
- Verification codes read from `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and `NEXT_PUBLIC_BING_SITE_VERIFICATION` env vars
- Added env var documentation to `.env.local.example` with dashboard URLs
- Existing `public/google7ea8fa19954d5e86.html` stays as primary Google verification; meta tag is belt-and-suspenders backup

---

## 2026-03-01: Fix Curzon Booking URLs
**Branch**: `fix/curzon-booking-urls` | **Files**: `src/scrapers/chains/curzon.ts`
- Curzon changed their frontend routing from path-based (`/ticketing/seats/MAY1-32556/`) to query-param (`/ticketing/seats/?sessionId=MAY1-32556`)
- All 184 Curzon booking links in the QA audit were returning 404
- Updated booking URL template in the scraper to use the new `?sessionId=` format
- Ran one-time database migration to fix 216 existing rows

---

## 2026-03-01: Fix Homepage Screening Counts
**PR**: #129 | **Branch**: `fix/homepage-screening-counts` | **Files**: `src/app/page.tsx`, `src/components/calendar/calendar-view-loader.tsx`, `src/components/calendar/calendar-view.tsx`
- Film cards on homepage showed screening counts from only the 3-day initial load, not all future screenings (e.g. "1 showing" instead of "5")
- Added `getCachedFilmTotals` server-side `GROUP BY` query that aggregates total screenings and distinct cinemas per film across all future dates
- Threaded server totals through `CalendarViewWithLoader` → `CalendarView` as authoritative source
- Falls back to client-side computation when festival/season filter is active (server totals are global, filters need scoped counts)
- Counts now match the film detail page from first render, regardless of progressive loading state

---

## 2026-03-01: CR-02 — Extract Header Subcomponents
**Branch**: `cr02-extract-header-subcomponents` | **Files**: `src/components/layout/header.tsx`, `src/components/layout/header/` (13 new)
- Decomposed the 1,522-line `header.tsx` into 10 focused subcomponents under `src/components/layout/header/`
- Extracted: MobileFiltersButton, ActiveFilterChips, FilmTypeFilter, DateTimeFilter, FilmSearchFilter, CinemaFilter, FormatFilter, ViewModeToggle, ClearFiltersButton, ShareFiltersButton
- Shared types in `types.ts`, utility helpers in `utils.ts`, barrel export in `index.ts`
- `header.tsx` is now a 157-line composition layer that imports and arranges subcomponents
- Pure refactoring: zero behavior changes, all tests pass

---

## 2026-03-01: CR-01 — Decompose pipeline.ts
**Branch**: `cr01-decompose-pipeline` | **Files**: `src/scrapers/pipeline.ts`, 3 new utility files in `src/scrapers/utils/`
- Extracted 3 giant methods (564 lines / 49.7% of file) into focused utility modules
- `film-title-cleaner.ts`: EVENT_PREFIXES array + `cleanFilmTitle()` (191 lines)
- `film-matching.ts`: Film cache, TMDB matching, similarity search, poster resolution (421 lines)
- `screening-classification.ts`: Event classification + duplicate detection (188 lines)
- `pipeline.ts` reduced from 1,134 to 570 lines (50% reduction)
- `getOrCreateFilm()` reduced from 276 to 70 lines; `insertScreening()` from 217 to 93 lines
- Pure refactoring: zero behavioral changes, all 683 tests pass

---

## 2026-02-28: CR-03 — Unify Title Extraction
**Branch**: `cr03-unify-title-extraction` | **Files**: `src/lib/title-extraction/` (6 new), 4 updated, 3 deleted
- Consolidated two independent title extractors (AI-powered + pattern-based) into `src/lib/title-extraction/`
- Shared `patterns.ts` with merged EVENT_PREFIXES, TITLE_SUFFIXES, NON_FILM_PATTERNS from both implementations
- Pattern extractor (`extractFilmTitleSync`) for enrichment agent fast loops (sync, no API calls)
- AI extractor (`extractFilmTitleAI`) for pipeline/scripts (async, Gemini-powered)
- Unified `index.ts` with caching, batch, and search variation exports
- Converted inline test cases to proper Vitest tests (pattern-extractor.test.ts)
- Deleted `src/lib/title-extractor.ts` (332 lines) and `src/agents/enrichment/title-extractor.ts` (390 lines)

---

## 2026-02-28: CR-04 — Admin Auth Middleware Factory
**Branch**: `cr04-admin-auth-middleware` | **Files**: 24 files across `src/lib/auth.ts`, `src/app/api/admin/`, tests
- Added `withAdminAuth()` HOF to `src/lib/auth.ts` — wraps the repeated `requireAdmin()` + `instanceof Response` check
- Migrated 22 handler functions across 18 admin routes (19 files) to use the new wrapper
- Updated 5 test files to match new handler signatures
- Skipped `bfi-import/route.ts` (uses `requireAuth()`, not `requireAdmin()` — different pattern, out of scope)

---

## 2026-02-28: Migrate AI Provider from Anthropic to Google Gemini
**Branch**: `feat/gemini-migration` | **Files**: 20+ files across `src/lib/`, `src/agents/`, `src/app/api/admin/`, tests
- Replaced `@anthropic-ai/sdk` and `@anthropic-ai/claude-agent-sdk` with `@google/genai`
- Created shared `src/lib/gemini.ts` utility: `generateText()`, `generateTextWithUsage()`, `stripCodeFences()`, `isGeminiConfigured()`
- Migrated 4 core pipeline files (title-extractor, content-classifier, event-classifier, film-similarity)
- Migrated 6 agent system files (config, enrichment, scraper-health, link-validator, fallback-enrichment, web-search)
- Migrated 6 admin API routes (env var checks + anomalies/verify direct usage)
- Updated all test mocks, GitHub Actions workflow, and `.env.local`
- Model: `gemini-3.1-pro-preview` for all AI calls (replaces haiku/sonnet split)

---

## 2026-02-28: Comprehensive Audit Fix — 897→624 Issues (30% reduction)
**PRs**: #120, #121, #122 | **Files**: `src/components/calendar/calendar-view.tsx`, `src/app/page.tsx`, `src/db/repositories/screening.ts`, `scripts/audit/checkers/booking-checker.ts`
- Fixed film card count mismatch: cards now show total screening counts (not filtered counts) matching detail pages
- Added contentType filter to both server-side and API screening queries — non-film content excluded from calendar
- Reclassified 4 non-film items; merged 8 duplicate film records; fixed 4 film title issues
- Enriched 725 films with TMDB data; updated audit checker domain maps and bot-protection whitelist
- Re-scraped Everyman (14 venues, 1137 screenings), Picturehouse (11 venues, 2167 screenings), Rich Mix, Lexi
- Non-film content: 11→0 | Broken links: 373→186 | Missing posters: 268→235 | Duplicates: 112→94
- **Remaining**: ~150 Curzon broken links (Cloudflare), 235 missing posters, invalid Anthropic API key

---

## 2026-02-25: Fix Duplicate Screenings & Split Cinema IDs
**Files**: `src/scrapers/runner-factory.ts`, `src/inngest/functions.ts`, `src/inngest/known-ids.ts`, `src/config/cinema-registry.ts`, `src/lib/title-patterns.ts`, `src/scrapers/pipeline.ts`, `src/db/migrations/canonicalize-cinema-ids.ts`, `scripts/verify-screening-integrity.ts`
- Fixed 210 duplicate screenings caused by split cinema IDs (6 cinemas using legacy+canonical IDs) and duplicate film records
- Central ID canonicalization: runner-factory now resolves all legacy IDs via `getCanonicalId()` before pipeline calls
- Inngest consistency: aligned nickel/phoenix to canonical IDs, removed INNGEST_ID_OVERRIDES
- Title pattern fix: "Twin Peaks", "Blade Runner", "John Wick", "Planet of the Apes" no longer split at colon
- Pipeline insert idempotency: `onConflictDoUpdate` + secondary title-normalized dedup guard
- Enhanced canonicalize migration with collision handling for safe re-runs
- Created verification script with 4 SQL integrity assertions

---

## 2026-02-20: Fix BFI Booking Links (Broken Search API)
**PR**: #118 | **Files**: `src/scrapers/bfi-pdf/url-builder.ts`, `src/scrapers/bfi-pdf/pdf-parser.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`, `scripts/fix-bfi-booking-urls.ts`
- Fixed all BFI booking links broken by BFI's search API change (`article_search_text` → `article_search_id` + `search_criteria`)
- Created shared `buildBFISearchUrl()` utility that routes IMAX vs Southbank to their respective booking sites with correct GUIDs
- Also fixed programme-changes parser always generating Southbank URLs for IMAX screenings
- Added one-time migration script to fix existing broken URLs in DB (`npx tsx scripts/fix-bfi-booking-urls.ts --apply`)
- 15 unit tests for URL builder covering venue routing, title encoding, and URL structure

---

## 2026-02-16: Manual Title Fixes + TMDB Matching via Claude Code
**PR**: TBD | **Files**: `scripts/manual-title-fixes.ts`, `AGENTS.md`
- Claude Code-driven bulk data cleanup: 298 unmatched films → 94 remaining (69% reduction)
- Phase 1: Deleted 50 non-film events (quizzes, talks, festivals, shorts compilations, music events)
- Phase 2: Reclassified 11 entries (ballet/opera → live_broadcast, TV series → event)
- Phase 3: 53 explicit title fixes matched to TMDB (stripped event prefixes, fixed misspellings, added year hints)
- Phase 4: 87 films merged with existing records (duplicate screenings consolidated)
- Overall improvement: Missing TMDB 548→131 (76%), Missing poster 246→14 (94%), Missing synopsis 524→129 (75%)
- Documented "Claude Code vs API Agents" strategy in AGENTS.md — direct script generation beats API-based enrichment for bulk passes
- Added `BAD_MERGE_TMDB_IDS` blocklist to prevent false-positive merges (e.g. "The Birds" → "The Bird's Placebo")

---

## 2026-02-16: Comprehensive Upcoming Screenings Data Quality Orchestrator
**PR**: TBD | **Files**: `scripts/audit-and-fix-upcoming.ts`, `package.json`
- New multi-pass orchestrator script (`npm run audit:fix-upcoming`) chains 8 passes for systematic data quality improvement
- Pass 1: Pre-flight audit captures baseline metrics for before/after comparison
- Pass 2: Non-film detection classifies unmatched entries as live_broadcast/concert/event using heuristic patterns
- Pass 3-6: Chains existing scripts (duplicate cleanup, title/TMDB/Letterboxd enrichment, fallback enrichment, poster audit)
- Pass 7: Dodgy entry detector flags long titles, ALL CAPS, year/runtime outliers, and fully unmatched films
- Pass 8: Final audit with delta comparison table showing improvement across all metrics
- Supports `--dry-run`, `--pass N` (single pass), `--skip N,N` (skip passes) flags
- Uses `execFileSync` (not `exec`) to avoid shell injection; all sub-scripts run with error isolation

---

## 2026-02-15: Fix Duplicate Films & Pipeline Resilience
**PR**: TBD | **Files**: `src/scrapers/pipeline.ts`, `src/lib/film-similarity.ts`, `src/lib/title-extractor.ts`, `scripts/cleanup-duplicate-films.ts`
- Fixed `normalizeTitle()` unicode handling: NFKD decomposition preserves accented chars ("Amélie" → "amelie" not "amlie")
- Added year stripping from titles ("Crash (1997)" → "Crash"), BBFC ratings, Q&A suffixes, format notes
- Expanded event prefix patterns: added 15+ new patterns (Galentine's Day, RBO Encore, Varda Film Club, etc.)
- Added TMDB ID secondary index to film cache for strongest dedup signal
- Lowered fuzzy matching thresholds (HIGH 0.7→0.6, LOW 0.4→0.35, MIN 0.3→0.25)
- Made `isLikelyCleanTitle()` stricter: titles >60 chars, ALL CAPS, or with parenthesized years go through AI extraction
- Enhanced cleanup script with TMDB + trigram similarity duplicate detection and union-find clustering
- Added 50 unit tests for normalizeTitle and cleanFilmTitle

---

## 2026-02-13: Festival Data Alignment & Eventive API Client
**PR**: TBD | **Files**: `src/db/seed-festivals.ts`, `src/scrapers/festivals/*`, `src/inngest/*`, `src/app/api/admin/festivals/scrape-eventive/`
- Fixed 4 stale venue IDs in seed data (prince-charles-cinema→prince-charles, rio-cinema→rio-dalston, genesis-cinema→genesis)
- Added LIFF and Doc'n Roll seed entries (previously in config only, missing from DB)
- Added EEFF and Sundance London config entries (previously in DB only, missing from config)
- Updated LIFF typicalMonths from April to June-July (festival recently moved)
- Built Eventive API client for structured festival programme scraping (FrightFest, UKJFF)
- Created Eventive scraper with venue name→canonical ID mapping and ticket availability detection
- Added alignment validation test ensuring config↔seed↔registry stay in sync (13 festivals)
- Added admin API: POST /festivals/scrape-eventive and Inngest daily cron at 11:00 UTC

---

## 2026-02-13: Festival Scraper System — Automated Festival Detection & Tagging
**PR**: TBD | **Files**: `src/scrapers/festivals/*`, `src/inngest/functions.ts`, 11 scraper files, 3 admin API routes
- Built three-layer festival detection system: reverse-tagger (batch), festival detector (inline), and programme watchdog
- Configured all 11 London festivals with per-festival tagging rules (AUTO for exclusive venues, TITLE for shared venues)
- Integrated FestivalDetector into all 11 venue scrapers (BFI, Barbican, ICA, PCC, Genesis, Rich Mix, Close-Up, Cine Lumiere, Rio, Garden, Curzon)
- Added Inngest crons: daily reverse-tagging at 09:00 UTC, watchdog every 6 hours
- Added admin API: GET /festivals/status, POST /festivals/reverse-tag, GET /festivals/audit
- Replaced hardcoded BFI detectFestival() with shared config-driven detector

---

## 2026-02-13: Film & Cinema Data Audit — Duplicate Cleanup
**PR**: TBD | **Files**: `src/scrapers/pipeline.ts`, `src/inngest/functions.ts`
- Merged 30 duplicate films (event-prefixed variants like "Film Club:", "DocHouse:", "RBO:") into canonical entries
- Consolidated 6 duplicate cinema pairs (legacy IDs → canonical registry IDs), migrating screenings
- Migrated Phoenix Cinema from legacy `phoenix` to canonical `phoenix-east-finchley` ID
- Reactivated Garden Cinema (was incorrectly marked inactive)
- Fixed Romford Lumiere Inngest config with correct URL, name, and address
- Added 6 missing event prefixes/suffixes to `cleanFilmTitle()` to prevent recurrence

---

## 2026-02-07: Data Cleanup — Films Missing TMDB Through Feb
**PR**: TBD | **Files**: `src/scripts/cleanup-feb-films.ts`, `package.json`
- One-time cleanup of 166 entries classified as films but missing TMDB data
- Deleted 62 non-film entries (events, talks, quizzes, concerts, workshops) with cascading screening removal
- Matched 36 real films to TMDB via title cleaning and year hints (19 more were duplicate TMDB IDs)
- 30 obscure/ambiguous entries left as-is; 14 real films unmatched by TMDB
- Backfilled 18 Letterboxd ratings and 12 posters for newly matched films

---

## 2026-02-07: iOS API Prerequisites — Backend Endpoints
**PR**: TBD | **Files**: `src/db/repositories/film.ts`, `src/db/repositories/cinema.ts`, `src/db/repositories/screening.ts`, `src/db/repositories/index.ts`, `src/app/api/films/[id]/route.ts`, `src/app/api/cinemas/route.ts`, `src/app/api/cinemas/[id]/route.ts`, `src/app/api/screenings/route.ts`
- New `GET /api/films/:id` endpoint with full film metadata + upcoming screenings (film repository)
- New `GET /api/cinemas` endpoint listing all active cinemas with optional chain/features filters (cinema repository)
- New `GET /api/cinemas/:id` endpoint with cinema detail + upcoming screenings
- Added cursor pagination to `GET /api/screenings` via `cursor` and `limit` query params (backward compatible)
- Extended screening select with accessibility fields (`hasSubtitles`, `hasAudioDescription`, `isRelaxedScreening`) and `film.contentType`, `film.tmdbRating`

---

## 2026-02-07: Enrich Upcoming Films Missing TMDB Data
**PR**: #106 | **Files**: `src/scrapers/pipeline.ts`, `src/scripts/enrich-upcoming-films.ts`, `package.json`
- Added 20 new event prefixes and 4 suffix patterns to `cleanFilmTitle` for better title cleaning
- New `enrich:upcoming` script: finds films with upcoming screenings missing TMDB data, decodes HTML entities/mojibake, strips event prefixes, uses AI extraction, fixes bad years, and matches to TMDB
- First run enriched 73 films with full TMDB data; 24 also got Letterboxd ratings

---

## 2026-02-07: PR #104 Review Fixes
**PR**: #104 | **Files**: `src/scrapers/runner-factory.ts`, `src/scrapers/bfi-pdf/fetcher.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`, `src/scrapers/load-bfi-manual.ts`, `src/scrapers/utils/fetch-with-retry.ts`
- Fixed race condition: `recordScraperRun` promises now tracked and flushed before `process.exit`
- Extracted shared `fetchWithRetry` into `src/scrapers/utils/fetch-with-retry.ts` (was copy-pasted in 2 BFI files)
- Fixed `useValidation: false` path silently ignoring blocked flag in both single-venue and chain paths
- Fixed `load-bfi-manual.ts` ignoring blocked flag from `processScreenings`
- Fixed chain venue `durationMs` being cumulative — now uses per-venue start time
- Removed unused `PipelineResult` type import and stale backoff comment

---

## 2026-02-07: Fix Date Serialization in Drizzle SQL Templates
**PR**: #104 | **Files**: `src/lib/scraper-health/index.ts`, `src/app/api/search/route.ts`
- Fixed crash on `/admin` caused by raw `Date` objects passed through Drizzle `sql` template literals; postgres.js Bind step requires strings, not Date instances.
- Applied `.toISOString()` to Date parameters in `COUNT(*) FILTER` health queries and search API join condition.
- Root cause: Drizzle ORM helpers (e.g. `gte()`) serialize Dates internally, but raw `sql` templates forward them as-is to the driver.

---

## 2026-02-06: Admin Ops Dashboard + Admin Auth Hardening
**PR**: #103 | **Files**: `src/app/admin/page.tsx`, `src/lib/auth.ts`, `src/middleware.ts`, `src/app/api/admin/*`, `src/lib/scraper-health/index.ts`
- Rebuilt `/admin` into an operations dashboard with scraper-health metrics and per-cinema re-scrape actions.
- Hardened `/admin/*` and `/api/admin/*` auth to enforce admin allowlist checks for both UI and API paths.
- Fixed health freshness calculations to prefer `cinemas.lastScrapedAt` (with fallback) so stale indicators reflect real scraper recency.
- Corrected admin screening update validation/runtime issues and expanded admin API test coverage.

---

## 2026-02-06: Admin Anomaly List Hydration-Safe Dismiss Filtering
**PR**: #102 | **Files**: `src/app/admin/anomalies/components/anomaly-list.tsx`
- Replaced effect-driven client-side anomaly filtering with derived filtering that activates only after hydration.
- Added local dismissed-cinema tracking so dismissed anomalies disappear immediately without re-running full effect initialization.
- Preserved server/client render consistency by showing unfiltered anomalies before hydration.

---

## 2026-02-06: Calendar View Hydration Filter-State Semantics
**PR**: #100 | **Files**: `src/components/calendar/calendar-view.tsx`
- Removed a synchronous hydration state update inside effect setup for film status persistence.
- Kept hydration completion subscription logic intact so hide-seen/hide-not-interested behavior still activates after persisted state is ready.
- Removed an unused `isIndependentCinema` import from the calendar view filter pipeline.

---

## 2026-02-06: AI Documentation Navigation Cleanup
**PR**: #97 | **Files**: `AI_CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, `src/scrapers/SCRAPING_PLAYBOOK.md`, `RECENT_CHANGES.md`, `changelogs/README.md`, `.gitignore`
- Added a single `AI_CONTEXT.md` index to route agents quickly to the right code and documentation.
- Added a tracked scraper playbook at `src/scrapers/SCRAPING_PLAYBOOK.md` and updated references away from the missing `docs/scraping-playbook.md` path.
- Simplified `CLAUDE.md` into a compatibility shim that defers to `AGENTS.md` as the canonical rules source.
- Trimmed `RECENT_CHANGES.md` back to ~20 entries and documented changelog archive usage.
- Removed tracked generated output (`playwright-report/index.html`) and ignored future Playwright report artifacts.

---

## 2026-02-06: Mobile Menu Scrim and Backdrop Accessibility
**PR**: #92 | **Files**: `src/components/layout/header-nav-buttons.tsx`
- Updated the mobile drawer backdrop from `bg-black/50` to `bg-black/60 backdrop-blur-sm` to match the app’s overlay depth treatment.
- Replaced the clickable backdrop `<div>` with a semantic `button` including an explicit close label for assistive tech.
- Preserved drawer open/close behavior while improving consistency and accessibility in core navigation.

---

## 2026-02-06: Admin Modal Scrim Consistency
**PR**: #91 | **Files**: `src/app/admin/cinemas/components/cinema-config-modal.tsx`, `src/app/admin/screenings/components/screening-form-modal.tsx`
- Standardized admin modal backdrops from `bg-black/50` to `bg-black/60 backdrop-blur-sm`.
- Aligned cinema config and screening form dialogs to the same overlay depth treatment used in other overlays.
- Preserved all modal interaction behavior (close-on-backdrop, focus/flow) while improving visual consistency.

---

## 2026-02-06: Film Card and Festival Badge Token Consistency
**PR**: #90 | **Files**: `src/components/calendar/film-card.tsx`, `src/components/festivals/festival-programme.tsx`
- Replaced hardcoded white/black overlay badge styling in film cards and festival programme cards with semantic token-based surfaces.
- Added subtle tokenized chip borders in film cards to improve definition and consistency with the broader UI system.
- Preserved all card behavior and content while aligning visual treatments to shared tokens.

---

## 2026-02-06: Overlay Scrim Consistency
**PR**: #89 | **Files**: `src/app/globals.css`, `src/components/layout/header-nav.tsx`, `src/components/layout/header-nav-buttons.tsx`, `src/components/search/search-dialog.tsx`
- Added a shared `overlay-scrim` utility class for full-screen backdrop overlays.
- Updated search and navigation overlay backdrops to use the same blur/opacity treatment.
- Standardized mobile drawer scrim from `bg-black/50` to the shared scrim so modal layering feels consistent.

---

## 2026-02-06: Fix Broken Accent Hover Tokens
**PR**: #88 | **Files**: `src/app/film/[id]/not-found.tsx`, `src/components/filters/date-range-picker.tsx`
- Replaced invalid `accent-hover` class usage with the defined `accent-primary-hover` token.
- Restored intended hover feedback for the film not-found CTA and date-range picker apply action.
- Keeps behavior unchanged while fixing missing visual state transitions in key navigation/filter flows.

---

## 2026-02-06: Accessibility Semantics for Search and Reachable Inputs
**PR**: #77 | **Files**: `src/components/search/search-dialog.tsx`, `src/components/layout/header-nav.tsx`, `src/app/reachable/reachable-page-client.tsx`, `src/components/filters/mobile-date-picker-modal.tsx`, `src/components/reachable/postcode-input.tsx`
- Replaced clickable backdrop `<div>` elements with accessible button semantics in both search dialogs, including explicit dialog attributes (`role`, `aria-modal`, labels)
- Added explicit accessible labels for header nav icon actions and search close controls to improve screen reader clarity
- Reworked reachable input headings into grouped `fieldset/legend` structures and added an explicit postcode input aria label
- Associated mobile custom time labels with select controls via `htmlFor`/`id` to remove orphaned label semantics
- Preserved behavior while reducing high-impact a11y lint issues in core discovery flows

---

## 2026-02-06: Calendar Listing Hierarchy and Token Alignment
**PR**: #78 | **Files**: `src/components/calendar/screening-card.tsx`, `src/components/calendar/table-view.tsx`, `src/components/film/status-toggle.tsx`, `src/components/error-boundary.tsx`, `src/app/globals.css`
- Unified calendar and status UI color semantics to design-system tokens (removed hardcoded amber/pink/gray/red treatment in core user-facing components)
- Tightened visual hierarchy in screening cards and table view spacing for better scanability in dense listing contexts
- Refined availability badges and repertory/format chips to use consistent surface/border treatments across cards
- Updated shared error-boundary visuals to match app token palette for coherent fallback experiences

---

## 2026-02-06: Error Surface Token Alignment
**PR**: #80 | **Files**: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/components/error-boundary.tsx`
- Replaced hardcoded/hex color values in route, global, and component error fallbacks with semantic design tokens.
- Aligned retry/home action styling and development error-detail colors to the shared token palette.
- Keeps all error handling behavior intact while making fallback experiences visually consistent and theme-safe.

---

## 2026-02-06: Calendar Status Overlay Token Consistency
**PR**: #87 | **Files**: `src/components/calendar/film-status-overlay.tsx`, `src/components/calendar/film-status-buttons.tsx`
- Updated compact watchlist/not-interested status controls to use semantic token classes instead of hardcoded white/neutral colors.
- Standardized active and hover states for calendar status overlays while preserving existing interaction behavior and contrast.
- Aligned overlay status styling with shared status tokens (`status-not-interested`, `accent-danger`).

---

## 2026-02-06: Watchlist Token Consistency
**PR**: #86 | **Files**: `src/components/watchlist/watchlist-view.tsx`
- Replaced hardcoded watchlist status/action colors (green/red utilities and `text-white`) with semantic design tokens.
- Fixed invalid utility classes (`accent-hover`, `accent-secondary`) by switching to existing token classes.
- Aligned watchlist CTA, section indicators, and action hover states to the same tokenized visual language used elsewhere.

---

## 2026-02-06: Legal and Consent Token Consistency
**PR**: #79 | **Files**: `src/app/terms/page.tsx`, `src/components/cookie-consent-banner.tsx`, `src/components/ui/badge.tsx`
- Replaced remaining hardcoded legal/consent warning colors with design-system tokens.
- Updated cookie consent action and status states to use semantic token colors for primary, success, danger, and warning contexts.
- Standardized shared `Badge` warning variant + removable hover surface to align with tokenized UI semantics.
- Keeps legal and privacy-critical UI consistent with the rest of the app without changing behavior.

---

## 2026-02-04: Admin BFI Import Endpoint
**PR**: #81 | **Files**: `src/app/api/admin/bfi-import/route.ts`, `src/middleware.ts`
- New admin endpoint to manually trigger BFI PDF imports
- Full import: `POST /api/admin/bfi-import` (parses monthly PDF + changes)
- Changes only: `POST /api/admin/bfi-import?changesOnly=true` (faster)
- GET endpoint returns usage info and scheduled job details
- Uses shared auth helpers and admin-only guards on `/api/admin/*`

---

## 2026-02-06: Normalize Frontend Tokens and Time Format
**PR**: #76 | **Files**: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/components/reachable/reachable-results.tsx`, `src/components/reachable/postcode-input.tsx`, `src/components/watchlist/watchlist-view.tsx`
- Replaced undefined Tailwind/token classes with existing design-system tokens across high-traffic pages (cinemas, directors, seasons, watchlist, map, reachable, and error surfaces)
- Converted remaining user-facing 12-hour reachable/festival time labels to the project-standard 24-hour format
- Standardized critical and warning color usage to `accent-*` tokens for consistent urgency semantics and reduced visual drift
- Removed mixed hardcoded hex values from global error UI so fallback screens now inherit the shared theme system

---

## 2026-02-06: Scraper Resilience - Session 1 Quick Wins
**PR**: #104 | **Files**: `src/scrapers/pipeline.ts`, `src/scrapers/runner-factory.ts`, `src/scrapers/bfi-pdf/fetcher.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`
- Fixed blocked scrapes silently reporting as success — added explicit `blocked` flag to PipelineResult
- Added jitter to exponential backoff to prevent thundering herd on concurrent retries
- Added `fetchWithRetry()` to BFI PDF fetcher and programme changes parser for ScraperAPI resilience
- Wired `recordScraperRun()` into all 5 runner exit paths with baseline anomaly detection
- Created self-improvement notes system (`tasks/lessons.md`, `tasks/scraper-lessons.md`)

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
