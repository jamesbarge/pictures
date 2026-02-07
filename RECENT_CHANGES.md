# Recent Changes

<!--
AI CONTEXT FILE - Keep last ~20 entries. Add new entries at top.
When an entry is added here, also create a detailed file in /changelogs/
-->

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
