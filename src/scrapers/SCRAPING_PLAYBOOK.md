# Scraping Playbook

Operational guide for scraper changes and incident response.

## When To Update This File
Update this playbook whenever you:
- Change selectors or extraction logic in a scraper
- Change date/time parsing behavior
- Add a new scraper command or runner
- Discover a recurring site-specific failure mode

## Shared Rules
- Always capture full time strings including AM/PM context.
- If a time is `1-9` with no AM/PM, default to PM.
- Treat times before `10:00` as likely parse errors and log warnings.
- Use `src/scrapers/utils/date-parser.ts` for shared parsing behavior.
- **Never use `new Date(year, month, day, hours, minutes)` to construct screening datetimes.** That ctor interprets numeric args as the runtime's local timezone, which silently produces +1h offsets during BST when the scraper runs under `TZ=UTC` (cron, CI, container). Always call `ukLocalToUTC(...)` from `utils/date-parser.ts` — it builds UTC explicitly and applies BST. Same goes for `parseUKLocalDateTime()` for ISO-like strings without a timezone suffix.
- After fixing time parsing bugs, verify and clean bad historical screenings (`00:00-09:59`) only when confirmed wrong.
- **`BaseScraper.healthCheck()` retries** (2026-05-15): 3 attempts, 10s timeout each, 4s backoff between attempts. Fast-fails on 4xx (contract issue), retries on 5xx + network errors. Subclasses can override for cheaper/different checks (e.g. Curzon HEADs the API endpoint with a 401-is-healthy contract). Background: Close-Up was failing 33% of runs at 03:17-03:21 UTC because of brief nightly-maintenance windows.

## Health & Flakiness Detection
The `/scrape` slash command runs three read-only detectors against `scraper_runs`:
- **`detectSilentBreakers`** (`src/lib/scrape-quarantine.ts`) — Prowlarr-pattern: flags cinemas with ≥N *consecutive* `success+0` runs.
- **`detectFlakyCinemas`** (same file, added 2026-05-15) — ratio-based: flags cinemas whose last `lookback` runs have ≥X% `success+0` or `failed`. Catches alternating empty/non-empty patterns that the consecutive detector misses. Default thresholds: `emptyRatioWarn=0.3, emptyRatioCritical=0.5, failedRatioWarn=0.3, failedRatioCritical=0.5, minRuns=4, lookback=10`. Implemented as a single windowed SQL (ROW_NUMBER OVER PARTITION).
- **`detectYieldDrop`** (same file, added 2026-05-15) — compares recent avg `screening_count` against a trailing baseline. Catches "success+low-but-non-zero" regressions that look healthy to the other two detectors (e.g. BFI PDF parser silently dropping one venue's screenings — 200 → 30). Default thresholds: `recentWindow=5, baselineWindow=20, minBaselineAvg=20, dropRatioWarn=0.5, dropRatioCritical=0.3`. Only considers `status='success'` rows so failures/empties don't pollute the math.
- Pure analyzers: `analyzeRunsForFlakiness(runs, thresholds)` and `analyzeYieldDrop(successRuns, thresholds)` — DB-free, unit-testable, internally sort by `startedAt` DESC so callers may pass any order.

## Primary Entrypoints
- Unified CLI: `src/scrapers/cli.ts` (`npm run scrape -- <slug>`)
- Pipeline orchestration: `src/scrapers/pipeline.ts`
- Base contract: `src/scrapers/base.ts`
- Shared runner helper: `src/scrapers/runner-factory.ts`

## Scraper Families
- Chains (multi-venue): `src/scrapers/chains/`
- Independent cinemas: `src/scrapers/cinemas/`
- Season scraping: `src/scrapers/seasons/`
- BFI PDF import flow: `src/scrapers/bfi-pdf/`

## Change Checklist
1. Confirm extractor output against live source pages.
2. Run targeted scraper command(s) for affected cinemas.
3. Validate saved DB values (not just screening counts).
4. Check times are sensible (mostly `10:00-23:59`).
5. Add/update tests when parser logic changes.
6. Record site-specific notes below.

## Site Note Template
Use this format when recording cinema-specific quirks:

```markdown
### <Cinema Name>
- Source URL pattern:
- Scraper file:
- Date/time format:
- Key selectors:
- Known pitfalls:
- Last verified (YYYY-MM-DD):
```

## High-Impact Sources (Current)
### BFI
- Scrapers: `src/scrapers/cinemas/bfi.ts` (**Playwright single-wide-search — PRIMARY, working as of 2026-05-30**), `src/scrapers/bfi-pdf/` (PDF importer — **fallback only**)
- Manual run: `npm run scrape:bfi` (Playwright path, both venues via `run-bfi-v2.ts` + runner-factory). `npm run scrape:bfi-pdf` still runs the PDF importer directly if ever needed.
- Date/time format: structured columns from the embedded `searchResults` array — feed `[11]`/`[10]`/`[9]` + `HH:MM` from `[8]` straight into `ukLocalToUTC`. 24h times, no AM/PM ambiguity.

- **✅ CORRECTION (2026-05-30): the Playwright path WAS NOT impossible. The prior "needs a paid proxy (ScraperAPI)" conclusion was WRONG — caused by (a) firing many navigations per session and (b) a parser bug.** The single-wide-search stealth method below works headless from a local IP, both venues, every run. No proxy, no paid service. `SCRAPER_API_KEY` / ScraperAPI is NOT used and NOT needed.

- **The winning method — ONE navigation per venue, large `page_size`:**
  - The site is AudienceView "Online" (Vista Classic), server-rendered `.asp`, no JSON/XHR API. Data is inline in the HTML as `searchNames : [...97 col names...]` + `searchResults : [ [...], ... ]` (object-literal properties — **colon-assigned, NOT `= ...;`, and NOT window globals**; `window.searchResults` is `undefined`). Parse by bracket-matching the array out of `await page.content()` — see `parseSearchResultsArray()` in `cinemas/bfi-parse.ts` (pure, unit-tested). A non-greedy regex fails on the nested arrays; walk to the matching `]`.
  - **Date-range search URL with a big page size returns the WHOLE window in page 1 (`totalPages=1`):**
    `default.asp?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_id=<GUID>&BOset::WScontent::SearchCriteria::search_from=DD/MM/YYYY&BOset::WScontent::SearchCriteria::search_to=DD/MM/YYYY&BOset::WScontent::SearchResultsInfo::page_size=2000`
    GUIDs: Southbank `25E7EA2E-291F-44F9-8EBC-E560154FDAEB`, IMAX `49C49C83-6BA0-420C-A784-9B485E36E2E0`.
  - **Why ONE navigation matters (this was the prior agent's mistake):** the search GET on the allowed `default.asp` path passes Cloudflare cold (HTTP 200, real title "Search results | BFI Southbank", full `searchResults`). But the fingerprint/IP reputation degrades after the FIRST navigation — verified live 2026-05-30: nav 1 (page_size=500) passed with 500 rows; nav 2 (`current_page=2`) AND nav 3 (page 1 again) BOTH returned `title="Just a moment..."`. So **do not paginate** (the old weekly-chunked / per-page approach = 6-12 navigations = guaranteed mid-session block). Instead set `page_size=2000` so all results land on page 1 in a single navigation. `totalPages=1` confirms full coverage.
  - **Implementation:** for each venue, open a FRESH `createPersistentPage(<unique-per-run profileKey>)` (timestamped userDataDir → always cold), navigate once to the wide-search URL, `waitForCloudflare(page, 60)`, extract + bracket-match `searchResults`, map rows, filter by column `[2]`. Retry up to 3× with fresh cold contexts + 10s/30s/60s backoff if the (transient) IP-reputation block hits. Each retry cleans its `/tmp` profile dir. Between the two venues a fresh context isolates Southbank's nav from IMAX's.
  - **Authoritative column indices (from `searchNames`, verified against live data 2026-05-30):** `[2]` type = venue — **`"BFI Southbank"` and `"IMAX"` (NOT "BFI IMAX" — the bare string `"IMAX"`; filter on this)**; `[5]`/`[6]` = film title; `[7]` start_date = "Saturday 30 May 2026 20:30" (UK local); `[8]` time = "20:30"; `[9]`/`[10]`/`[11]` = day / month (**0-indexed**) / year; `[15]` availability_status; `[18]` additional_info = booking/article URL of the form `default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=<GUID>&...context_id=<GUID>` (the `loadArticle=Load` token is the work ACTION, **not** an id — extract `article_id=`/`context_id=` for a stable sourceId, never `loadArticle=`); `[63]` = "Southbank - NFT3" (screen); `[64]` = "Screen NFT3".
  - **sourceId scheme:** `bfi-<cinemaId>-<articleId-or-titleslug>-<datetime.toISOString()>`. Article-id keeps it stable across re-scrapes; datetime keeps it unique per screening. Re-runs UPDATE in place via the (cinema_id, source_id) partial unique index — verified idempotent (run 2: Southbank 484 updated/28 added, IMAX 94 updated/0 added).
  - **Non-film filter:** building tours (e.g. "BFI Southbank and BFI IMAX Tour" @ 09:45) appear in the same feed — `isNonFilmEvent()` drops `/\btour\b/i` plus the usual library/workshop/membership patterns. The validator also rejects times before 10:00 (caught one malformed "The Odyssey @ 1:00" IMAX row).
  - **Verified live 2026-05-30 (npm run scrape:bfi → DB):** bfi-southbank **512** future screenings through 2026-07-31 (0 suspicious times); bfi-imax **94** future through 2026-07-19 (0 suspicious). Both reach past 2026-06-30. Times match the site (e.g. "Black God, White Devil" 30 May 20:30 NFT3). Stale old PDF/changes rows (hour-shifted, non-matching sourceIds) were cleaned in the same pass; DB is now 100% Playwright-sourced.

- **PDF importer (fallback only, still intact):** `getOrLoadBFIScreenings()` in `cinemas/bfi.ts` routes to `bfi-pdf/`'s `loadBFIScreenings()` and is invoked **only if all 3 Playwright attempts fail** (e.g. a genuinely / persistently flagged IP). It throws when both PDF + programme-changes sources fail (yield gate), so the runner records `status=failed` rather than masking a block behind `success+0`. PDF can be RETIRED once the Playwright path has a few weeks of healthy production runs; kept for now as a safety net.
- **`createPersistentPage()` minimal-stealth bypass (2026-05-14, still true):** only `launchPersistentContext` + the single webdriver-flag eviction passes; the full `createPage()` anti-detection suite trips fingerprint-inconsistency detection. The shared `getBrowser()` singleton triggers the challenge cold and times out — do not use it for BFI.
- **PDF binaries are NOT Cloudflare-protected**: `core-cms.bfi.org.uk/media/*/download` serves directly via plain `fetch()`. Only the PDF discovery page needs the bypass.
- **PDF text comes as one continuous string** (no newlines). `pdf-parser.ts` calls `segmentBFIText()` to insert newlines at screening-pattern and metadata-pattern boundaries before line-based parsing.
- **`Promise.try` polyfill**: `unpdf@1.4.0` requires `Promise.try` (Node ≥22.7 / V8 13.3). `pdf-parser.ts` has a top-of-file polyfill that runs BEFORE the unpdf import to keep older Node versions working.

### Picturehouse
- Scraper: `src/scrapers/chains/picturehouse.ts`
- Notes: API-based flow; generally highest reliability.

### Curzon
- Scraper: `src/scrapers/chains/curzon.ts`
- Source URL pattern: `https://www.curzon.com/venues/{slug}/`
- API: `https://digital-api.curzon.com/ocapi/v1/` (Vista OCAPI)
- Auth: JWT embedded in SSR HTML at `window.initialData.api.authToken`
  - Primary extraction: `page.evaluate()` reads the token from the JS context
  - Fallback: request interception on `digital-api.curzon.com` requests
  - Token issuer: `https://auth.moviexchange.com/` (Vista Connect)
- Date/time format: TZ-less ISO 8601 from API (`schedule.startsAt`, e.g. `"2026-05-13T14:15:00"`) — UK local time. Must use `parseUKLocalDateTime()` (NOT `new Date()`).
- Known pitfalls:
  - **Cloudflare protection**: Raw fetch returns 403; requires Playwright with stealth plugin
  - **networkidle never fires**: Curzon SPA loads analytics/chunks indefinitely. Use `domcontentloaded`.
  - **API domain migration (2026-02-22)**: Changed from `vwc.curzon.com` to `digital-api.curzon.com`
  - **Booking URL format change (2026-03-01)**: Moved from path-based to `?sessionId=` query param
  - **Headless detection**: Without stealth plugin + `--disable-blink-features=AutomationControlled`, the Vista SDK does not initialize and no API calls are made
  - **healthCheck**: Cloudflare blocks HEAD to `www.curzon.com`; use API endpoint instead (401 = healthy)
  - **BST timezone (fixed 2026-05-12)**: `schedule.startsAt` is TZ-less. Original `new Date(startsAt)` silently added 1h under `TZ=UTC` during BST. Migrated to `parseUKLocalDateTime`. Duplicate-pair probe confirmed 15 ghost rows existed; cleaned in same change. Same fix class as #484 (Everyman) and #485 (Picturehouse).
- Vista site codes: SOH1, MAY1, BLO1, ALD1, VIC1, HOX1, KIN1, RIC1, WIM01, CAM1
- Last verified (2026-03-18): SSR token extraction working, all venues returning data

### Barbican
- Scraper: `src/scrapers/cinemas/barbican.ts`
- Source URL pattern: `https://www.barbican.org.uk/whats-on/cinema?day=YYYY-MM-DD`
- Approach: Daily cinema listing page (Cheerio, static HTML)
- Date/time format: Times displayed as "12.00pm", "5.55pm" (dot separator, 12-hour with am/pm). Convert dot to colon before feeding to `parseScreeningTime()`.
- Key selectors:
  - `.cinema-listing-card` — film card container
  - `.cinema-listing-card__title a` — film title + event URL (href to `/whats-on/YYYY/event/slug`)
  - `.cinema-instance-list__instance` — individual showtime
  - `a[href*="tickets.barbican"], a[href*="choose-seats"]` — booking link (text is the time)
  - Sold out: no booking link; `<span>` contains "X.XXpm (Sold out)"
- Known pitfalls:
  - **BST timezone**: Displayed times are UK local. Must use `ukLocalToUTC()` to convert.
  - **Sold-out screenings**: Have no `<a>` tag, only a `<span>` with "(Sold out)" appended to the time.
  - **Coverage**: The `/whats-on/cinema?day=` page covers ALL cinema series (New Releases, Cold War Visions, Relaxed Screenings, London Soundtrack Festival, etc.). The old `/whats-on/series/new-releases` page only covered one series.
  - **Day range**: The nav shows ~7 days but the `?day=` parameter accepts any future date. We scrape 14 days ahead.
  - **Old performances endpoint**: The `/whats-on/event/{nodeId}/performances` page still works but its `datetime` attribute has a misleading `Z` suffix — the values are actually UK local time, not UTC. The old scraper used `new Date(attr)` which was off by 1 hour during BST.
- Last verified (2026-04-10): Rewrote to use daily listing approach. 9 screenings parsed from April 10 test page, matching website exactly.

### Castle Cinema (Hackney) and Castle Sidcup
- Scrapers: `src/scrapers/cinemas/castle.ts`, `src/scrapers/cinemas/castle-sidcup.ts`
- Shared parser: `src/scrapers/cinemas/castle-calendar.ts`
- Source URL pattern: `<baseUrl>/calendar/` (Hackney: `https://thecastlecinema.com/calendar/`, Sidcup: `https://castlesidcup.com/calendar/`)
- Approach: One static HTML fetch per venue. Parse `.performance-button` elements (one per screening) and resolve film title from the most recent preceding `<h1>` in document order, scoped to the calendar block.
- Key selectors / attributes:
  - `<h3 class="date">Wed, 6 May</h3>` — day section heading. The first `<h3 class="date">` anchors the calendar block; any `<h1>` before it (page chrome, header) is ignored.
  - `<h1>Film Title</h1>` — film card title heading inside the calendar block
  - `<a class="performance-button" data-perf-id="…" data-start-time="2026-05-06T16:00:00" href="/bookings/…/">` — one per screening. Attribute order is fixed in the Wagtail template.
- Date/time format: `data-start-time` is UK local time with no timezone suffix. Use `parseUKLocalDateTime()` to handle BST correctly.
- sourceId format: `castle-{perfId}` for Hackney, `castle-sidcup-{perfId}` for Sidcup.
- Known pitfalls:
  - **Homepage JSON-LD only surfaces ~7 days of programming.** The previous (pre-2026-05-06) scrapers used homepage JSON-LD and missed ~89 screenings combined. Always use `/calendar/`.
  - **Document-order title resolution is sensitive to in-calendar `<h1>` tags.** The parser scopes `<h1>` collection to the calendar block (everything after the first `<h3 class="date">`), so page-chrome `<h1>` tags can't bleed in. Any *new* `<h1>` introduced inside the calendar — e.g. a per-section banner — would be picked up as a film title and mis-attribute screenings.
  - **Attribute-order coupling**: the structured regex requires `class → data-perf-id → data-start-time → href`. The parser detects template drift (any `class="performance-button"` opening tag with zero structured matches) and throws a hard error rather than returning empty silently.
  - **HTML entities** in titles (`&apos;`, `&amp;`, `&ndash;`, `&#8217;` etc.) are decoded inline by the parser; the downstream `cleanFilmTitleWithMetadata` handles further normalization.
  - **Nested tags inside `<h1>`** (e.g. `<h1>Title <em>part</em></h1>`) would break the `[^<]+` capture. Not seen in current templates; if it appears, switch to a tag-tolerant capture.
- Last verified (2026-05-06): Castle Hackney 91 screenings (23 distinct dates through 2026-10-22), Castle Sidcup 132 screenings (17 distinct dates through 2026-06-25).

### Everyman
- Scraper: `src/scrapers/chains/everyman.ts`
- Notes: Playwright-heavy; more sensitive to markup and client-side app changes.

### JW3 (Finchley Road)
- Scraper: `src/scrapers/cinemas/jw3.ts` (fetch-based, no browser — runnable under tsx).
- Ticketing: Spektrix, client `jw3`. Public read API base: `https://ticket.jw3.org.uk/jw3/api/v3`.
- Strategy (2 calls): `GET /events` → keep `attribute_Genre == "Cinema"` (excludes the centre's
  talks/languages/classes/music/walks); `GET /instances?startFrom=YYYY-MM-DD&startTo=YYYY-MM-DD`
  → join to Cinema events by `event.id`.
- Dates: `instance.startUtc` is UTC **without** a trailing `Z` — append `Z` before `new Date(...)`.
  No `ukLocalToUTC` needed (Spektrix already converts), so the BST off-by-one cannot occur here.
- Booking URL: `https://www.jw3.org.uk/spektrix/ChooseSeats?EventInstanceId=<instance.id>` (verified 200).
- `sourceId`: `jw3-<instance.id>`; poster from `event.imageUrl`; availability from `instance.isOnSale`.
- Known: NT Live / live broadcasts also carry `attribute_Genre = "Cinema"` and flow through; the
  data-quality pipeline classifies `content_type` downstream.
