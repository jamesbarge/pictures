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
- Dates passed to `combineDateAndTime()` must be UTC-midnight dates from `parseScreeningDate()` or `Date.UTC(...)`; `date-fns/parse()` returns runtime-local midnight and can shift the screening to the previous day when `combineDateAndTime()` reads UTC components.
- **Never use `new Date(year, month, day, hours, minutes)` to construct screening datetimes.** That ctor interprets numeric args as the runtime's local timezone, which silently produces +1h offsets during BST when the scraper runs under `TZ=UTC` (cron, CI, container). Always call `ukLocalToUTC(...)` from `utils/date-parser.ts` — it builds UTC explicitly and applies BST. Same goes for `parseUKLocalDateTime()` for ISO-like strings without a timezone suffix.
- After fixing time parsing bugs, verify and clean bad historical screenings (`00:00-09:59`) only when confirmed wrong.
- **`BaseScraper.healthCheck()` retries** (2026-05-15): 3 attempts, 10s timeout each, 4s backoff between attempts. Fast-fails on 4xx (contract issue), retries on 5xx + network errors. Subclasses can override for cheaper/different checks (e.g. Curzon HEADs the API endpoint with a 401-is-healthy contract). Background: Close-Up was failing 33% of runs at 03:17-03:21 UTC because of brief nightly-maintenance windows.
- **Do not turn fetch/parse exceptions into successful empty results.** A valid zero-screening chain venue must remain present in the returned `Map` with `[]`; a failed venue must be omitted and recorded in `venueErrors`. The shared runner marks any requested venue missing from the result map as failed. Multi-page independent scrapers must throw when any required page fails so partial coverage is not persisted as a successful run.
- **Time provenance (plan 010, 2026-06-12)**: when a scraper's datetimes come from ISO/API timestamps (not parsed display text), set `RawScreening.timeSource: "iso"`. The validator then treats `suspicious_time_early` (<10:00) as warn-not-reject (ISO times can't have AM/PM errors — Everyman's real 09:00 kids shows were being discarded) and raises the `too_far_future` cap from 90 to 180 days (long-lead event cinema like Met Opera 2026-27 at the chains). Leave text-parsed scrapers unset (treated as `"text"`, full strictness). Currently set by: Curzon (Vista API), Picturehouse (API), Everyman (boxofficeapi), Castle/Castle Sidcup (`data-start-time` attribute via castle-calendar).
- **Runtime capture (plan 006, 2026-06-12)**: when a source exposes the film's runtime, forward it as `RawScreening.runtime` (minutes) — the TMDB matcher uses it to reject junk stubs and penalize wrong-era matches. Always pass the raw value through `sanitizeRuntime()` (`src/scrapers/utils/metadata-parser.ts`): coerces numeric strings, guards to the 1–600 minute band, returns `undefined` otherwise. Currently emitted by Rio, ICA, Garden Cinema, and Curzon. Caveat: venue runtimes may include event padding (intros/Q&As). Padding within 30 min is tolerated; beyond that the matcher applies a −0.15 confidence penalty, which strong matches (e.g. exact-year classics) usually survive but borderline ones may not. An asymmetric tolerance (venue-above-TMDB is padding, venue-below-TMDB is a wrong-film signal) is a candidate plan-005 scoring follow-up.

## sourceId Schemes (plan 009, 2026-06-12)

`screenings.source_id` is the stable per-row dedup key behind the partial
unique index `(cinema_id, source_id) WHERE source_id IS NOT NULL`. The
pipeline is upsert-only — rows that vanish from a source are never deleted —
so **changing a scraper's sourceId scheme strands every existing row as a
phantom**. This table is what makes the next scheme change detectable.

Rules:
- Every scraper must set `sourceId` on **every** emitted `RawScreening` —
  unconditionally (no regex-miss `undefined` paths).
- Prefer an upstream booking-system id; otherwise derive a deterministic
  composite (`{prefix}-{slugify(title)}-{datetime.toISOString()}` using
  `slugify` from `src/scrapers/utils/url.ts`). Derived ids change when the
  source retitles or moves a screening — that is expected, and the reconcile
  sweep cleans the strays.
- **If you change any scheme below, you MUST update this table and run the
  reconcile sequence for that cinema in the same session:**
  scrape venue once → `npm run reconcile:plan -- <cinemaId>` → review →
  `npm run reconcile:apply -- <cinemaId>`. Otherwise every pre-change row
  becomes a permanent phantom.

| Scraper (file) | cinema_id(s) | Scheme | Key source |
|---|---|---|---|
| Curzon (`chains/curzon.ts`) | `curzon-*` | `curzon-{showtime.id}` | Vista OCAPI showtime id |
| Picturehouse (`chains/picturehouse.ts`) | `picturehouse-*` | `picturehouse-{venue.id}-{ShowTime.SessionId}` | API SessionId |
| Everyman (`chains/everyman.ts`) | `everyman-*` | `everyman-{venue.id}-{showtime.id}` | boxofficeapi showtime id |
| BFI (`cinemas/bfi.ts` → `bfi-pdf/bfi-source-id.ts`) | `bfi-southbank`, `bfi-imax` | `bfi-{cinemaId}-{titleSlug}-{screen}-{ISO}` | derived, path-agnostic across Playwright/PDF (PR #640) |
| Barbican (`cinemas/barbican.ts`) | `barbican` | `barbican-{YYYY-MM-DD}-{HHMM}-{titleSlug}` | derived |
| Phoenix (`cinemas/phoenix.ts`) | `phoenix-east-finchley` | `phoenix-{titleSlug}-{ISO}` | derived |
| Electric (`cinemas/electric-v2.ts`) | `electric-portobello`, `electric-white-city` | `electric-{screeningId}` | site JSON screening key |
| Lexi (`cinemas/lexi.ts`) | `lexi` | `lexi-{film.ID}-{perf.ID}` | Admit One API ids |
| Regent Street (`cinemas/regent-street.ts`) | `regent-street` | `regent-street-{showing.id}` | API showing id |
| Rich Mix (`cinemas/rich-mix-v2.ts`) | `rich-mix` | `richmix-{inst.id}` | Spektrix v3 API instance id (scheme changed 2026-07-13 with the API rewrite; no reconcile needed — 0 upcoming rows existed, old WP endpoint dead since site restructure) |
| JW3 (`cinemas/jw3.ts`) | `jw3` | `jw3-{inst.id}` | API instance id |
| Castle (`cinemas/castle.ts` → `castle-calendar.ts`) | `castle` | `castle-{perfId}` | Jacro perf id |
| Castle Sidcup (`cinemas/castle-sidcup.ts` → `castle-calendar.ts`) | `castle-sidcup` | `castle-sidcup-{perfId}` | Jacro perf id |
| Rio (`cinemas/rio.ts`) | `rio-dalston` | `rio-dalston-{event.ID}-{ISO}` | event id + datetime |
| Prince Charles (`cinemas/prince-charles.ts`) | `prince-charles` | `{perfId}` (bare digits from `booknow/(\d+)`); fallback `prince-charles-{titleSlug}-{ISO}` | Jacro perf id; derived fallback added 2026-06-12 so sourceId is never undefined. Bare-digit primary kept deliberately — prefixing would strand all existing rows |
| ICA (`cinemas/ica.ts`) | `ica` | `ica-{titleSlug}-{ISO}` | derived (lowercase, whitespace→dash, punctuation kept) |
| Genesis (`cinemas/genesis.ts`) | `genesis` | `genesis-{perfCode}` | site perfCode |
| Peckhamplex (`cinemas/peckhamplex.ts`) | `peckhamplex` | `peckhamplex-{titleSlug}-{ISO}` | derived |
| Nickel (`cinemas/nickel-v2.ts`) | `the-nickel` | `nickel-{item.id}` | API item id |
| Garden (`cinemas/garden.ts`) | `garden` | `garden-{slugify(title)}-{ISO}` | derived |
| Close-Up (`cinemas/close-up.ts`) | `close-up-cinema` | `close-up-{show.id}-{ISO}` (API), `close-up-html-{ISO}-{titleSlug}`, `close-up-search-{ISO}-{titleSlug}` | API id; derived on HTML/search fallback paths |
| Bertha DocHouse (`cinemas/bertha-dochouse.ts`) | `bertha-dochouse` | `bertha-{ticketId}` | ticket id (`BLO1-XXXXXX`) |
| Cinema Museum (`cinemas/cinema-museum.ts`) | `cinema-museum` | `cinema-museum-{ev.uid}` | ICS event uid |
| Ciné Lumière (`cinemas/cine-lumiere.ts`) | `cine-lumiere` | `cine-lumiere-{titleSlug}-{ISO}` | derived (lowercase, whitespace→dash, punctuation kept) |
| ArtHouse Crouch End (`cinemas/arthouse-crouch-end.ts`) | `arthouse-crouch-end` | `arthouse-{titleSlug}-{ISO}` | derived (lowercase, whitespace→dash, punctuation kept) |
| Coldharbour Blue (`cinemas/coldharbour-blue.ts`) | `coldharbour-blue` | `coldharbour-{event.id}` | API event id |
| Olympic (`cinemas/olympic.ts`) | `olympic-studios` | `olympic-{bookingId}-{ISO}` | booking id from URL (`""` when absent; ISO keeps it unique) |
| David Lean (`cinemas/david-lean.ts`) | `david-lean-cinema` | `david-lean-{titleSlug≤30}-{ISO}` | derived (lowercase, whitespace→dash, punctuation kept) |
| Riverside (`cinemas/riverside-v2.ts`) | `riverside-studios` | `riverside-{event.id}-{perf.timestamp}` | event id + perf timestamp |
| L-CUT gap-fill (`scripts/lcut-gapfill.ts`) | multiple (real venues, incl. `the-arzner`, `horse-hospital`, `good-shepherd-studios`, `project-loop`) | `lcut-{lcutMongoId}` | L-CUT API film id (`https://lcutlondon.com/api/films/date/DD-MM-YYYY?page=N`) |

### Phantom reconcile (`src/scripts/reconcile-phantom-screenings.ts`)

Generalized, default-dry sweep for rows the source no longer lists. It
**supersedes the one-off `src/scripts/_bfi_reconcile.ts`** staging script
(untracked; delete it when encountered — its logic now lives here,
parameterized per cinema). Unlike the BFI one-off it does not scrape: run the
venue's scraper first, then reconcile while the run is < 2h fresh.

- `npm run reconcile:plan -- <cinemaId>` — prints every doomed row; no writes.
- `npm run reconcile:apply -- <cinemaId>` — deletes the planned rows.
- Hard guards (all enforced, unit-tested pure functions): single registry-known
  cinema per invocation; successful `scraper_runs` entry completed < 2h ago
  AND with a non-zero screening count (an empty "success" scrape is refused,
  never overridable); candidates limited to `datetime >= now()` AND
  `scraped_at < run start` AND `datetime <= scrape horizon` (the latest
  datetime the run actually refreshed — stale rows beyond demonstrated
  coverage are printed as EXCLUDED, never deleted); re-guarded inside the
  DELETE; refusal above a 40% deletion cap (`--force-large` overrides with a
  red warning); batched (100) deletes in a single transaction.
- Limitation: accepts canonical registry cinema IDs only — rows under legacy
  cinema IDs are not swept.

## Health & Flakiness Detection
The `/scrape` slash command runs three read-only detectors against `scraper_runs`:
- **`detectSilentBreakers`** (`src/lib/scrape-quarantine.ts`) — Prowlarr-pattern: flags cinemas with ≥N *consecutive* `success+0` runs.
- **`detectFlakyCinemas`** (same file, added 2026-05-15) — ratio-based: flags cinemas whose last `lookback` runs have ≥X% `success+0` or `failed`. Catches alternating empty/non-empty patterns that the consecutive detector misses. Default thresholds: `emptyRatioWarn=0.3, emptyRatioCritical=0.5, failedRatioWarn=0.3, failedRatioCritical=0.5, minRuns=4, lookback=10`. Implemented as a single windowed SQL (ROW_NUMBER OVER PARTITION).
- **`detectYieldDrop`** (same file, added 2026-05-15) — compares recent avg `screening_count` against a trailing baseline. Catches "success+low-but-non-zero" regressions that look healthy to the other two detectors (e.g. BFI PDF parser silently dropping one venue's screenings — 200 → 30). Default thresholds: `recentWindow=5, baselineWindow=20, minBaselineAvg=20, dropRatioWarn=0.5, dropRatioCritical=0.3`. Only considers `status='success'` rows so failures/empties don't pollute the math.
- Pure analyzers: `analyzeRunsForFlakiness(runs, thresholds)` and `analyzeYieldDrop(successRuns, thresholds)` — DB-free, unit-testable, internally sort by `startedAt` DESC so callers may pass any order.

## Primary Entrypoints
- Unified CLI: `src/scrapers/cli.ts` (`npm run scrape -- <slug>`)
- Scraper registry: `src/scrapers/registry.ts` is the single source of truth for orchestrator tasks and the unified CLI. Add new scrapers there; use `cliAliases` only to preserve established CLI slugs.
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

## Date Parser Notes
- **Phoenix, Olympic, David Lean (2026-06-09):** Date labels are parsed through `parseScreeningDate()` before combining with UK-local times. Do not reintroduce `date-fns/parse()` for these paths.
- **Genesis (2026-06-09):** Time labels use `parseScreeningTime()` so ambiguous `1:00-9:59` values default to PM.
- **Close-Up (2026-06-09):** Search-page date-only values are UTC-midnight dates; combine them with `ukLocalToUTC()` using UTC date components.

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
- **⚠️ Legacy `bfi-changes-` cluster rows — recurring failure mode (incident 2026-06-21):** the programme-changes fallback historically (pre-#640) minted `bfi-changes-<slug>-<iso>` sourceIds and had a `getFollowingText` bug that stamped **every film in a shared `<p>` with every sibling's showtimes** (e.g. ~12 films all at 19:00/19:05/21:45/21:50). #640 (2026-06-01) fixed both — the changes path now uses `buildBfiSourceId()` (`bfi-<cinemaId>-…`) and `getFollowingText` is bounded by the next bold title — so **current code can NOT emit `bfi-changes-` sourceIds at all**. If you ever see `bfi-changes-` rows in the DB again, it means **a pre-#640 checkout/scheduler ran the scrape** (the orchestrator runs separately from Vercel; a stale local checkout or a long-running scheduler started before 06-01 holds old code in memory). The fix is: (1) ensure the machine running the scrape is on `main` ≥ commit `dc5cf639`, re-run `npm run scrape:bfi`; (2) the upsert key is `(cinema_id, source_id)` and `cleanup-superseded` only prunes **within** a sourceId scheme, so legacy rows are orphaned and must be deleted explicitly — `npm run`-less SQL (tsx wedges locally; use psql):
  ```sql
  DELETE FROM screenings WHERE cinema_id IN ('bfi-southbank','bfi-imax') AND source_id LIKE 'bfi-changes-%';
  ```
  Verified harmless: a fresh Playwright scrape re-sources every real screening under the `bfi-<cinema>-` scheme; the `bfi-changes-` rows are 100% fabrications/duplicates. 2026-06-21 cleanup removed 1,054 such rows (143 future) and restored the intended **100% Playwright-sourced** state.
- **`createPersistentPage()` minimal-stealth bypass (2026-05-14, still true):** only `launchPersistentContext` + the single webdriver-flag eviction passes; the full `createPage()` anti-detection suite trips fingerprint-inconsistency detection. The shared `getBrowser()` singleton triggers the challenge cold and times out — do not use it for BFI.
- **PDF binaries are NOT Cloudflare-protected**: `core-cms.bfi.org.uk/media/*/download` serves directly via plain `fetch()`. Only the PDF discovery page needs the bypass.
- **PDF text comes as one continuous string** (no newlines). `pdf-parser.ts` calls `segmentBFIText()` to insert newlines at screening-pattern and metadata-pattern boundaries before line-based parsing.
- **`Promise.try` polyfill**: `unpdf@1.4.0` requires `Promise.try` (Node ≥22.7 / V8 13.3). `pdf-parser.ts` has a top-of-file polyfill that runs BEFORE the unpdf import to keep older Node versions working.

### Picturehouse
- Scraper: `src/scrapers/chains/picturehouse.ts`
- Notes: API-based flow; generally highest reliability.
- Failure handling: HTTP errors and invalid API envelopes are recorded in `venueErrors`; failed venues are omitted from the result map.

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
  - **Failure handling**: total auth failure throws; failed venue/date API calls are recorded as venue failures rather than successful empty results.
- Vista site codes: SOH1, MAY1, BLO1, ALD1, VIC1, HOX1, KIN1, RIC1, WIM01, CAM1
- Metadata: `relatedData.films[].runtimeInMinutes` (integer minutes) is forwarded as `RawScreening.runtime` via `sanitizeRuntime()` (plan 006, 2026-06-12). Year comes from `releaseDate`, director from `castAndCrew` cross-referenced against `relatedData.castAndCrew`.
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
  - **Day range**: The nav shows ~7 days but the `?day=` parameter accepts any future date. We scrape 30 days ahead.
  - **Failure handling**: any failed fetch or parse in the required 30-day window fails the run, preventing a partial scrape from being recorded as success.
  - **Old performances endpoint**: The `/whats-on/event/{nodeId}/performances` page still works but its `datetime` attribute has a misleading `Z` suffix — the values are actually UK local time, not UTC. The old scraper used `new Date(attr)` which was off by 1 hour during BST.
  - **BBFC certificate in titles**: Raw titles carry a trailing certificate like `"(12A)"`, which the title cleaner strips. Deliberately NOT captured (plan 006 YAGNI decision, 2026-06-12): `RawScreening` has no certificate field, the matcher doesn't consume certificates, and `films.certification` is filled by TMDB enrichment. Revisit only if a consumer lands.
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
- Failure handling: scheduled-movie, movie-detail, and schedule API errors are recorded in `venueErrors`; a valid empty schedule remains a successful `[]` result.

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

### Cinema Museum (Kennington, SE11)
- Scraper: `src/scrapers/cinemas/cinema-museum.ts` (fetch-based iCal, runnable under tsx).
- Source URL pattern: `https://cinemamuseum.org.uk/schedule/?ical=1` (The Events Calendar WP plugin iCal feed).
- Date/time format: timezone-aware `DTSTART;TZID=Europe/London`, parsed via `parseVEvents()` → `ukLocalToUTC()`.
- `sourceId`: `cinema-museum-<UID>`. Excludes `Tours` / `Bazaar(s)` categories.
- **WAF / User-Agent (UPDATED 2026-06-12 — behaviour INVERTED since the scraper was written):**
  - The site is behind a SiteGround WAF. Verified live 2026-06-12 against `?ical=1`:
    - **403** to browser-fingerprint UAs (anything containing `Chrome` or a full desktop UA string).
    - **403** to the OLD self-identifying UA `Mozilla/5.0 (compatible; pictures-cinema-museum-scraper/1.0; +https://pictures.london)` that this scraper used to send — the WAF now blocks it too. THIS was the breakage.
    - **200** to plain non-browser calendar-client UAs (`curl/*`, empty UA, `Googlebot`, Node's default fetch UA, and `Google-Calendar-Importer`).
  - Fix: both `fetchPages()` and `healthCheck()` now send `CALENDAR_CLIENT_USER_AGENT` (`"Google-Calendar-Importer"`, in `src/scrapers/constants.ts`). **Do NOT switch this to a Chrome UA — that is the blocked class.**
  - Note: the original code comment claimed browser UAs were blocked while the self-id UA was allowed. The first half is still true; the second half is no longer — hence the inverted-behaviour warning.
- Verified live 2026-06-12: `healthCheck()` true, `scrape()` → 25 screenings, 0 suspect (<09:00 UTC) times. Cross-checked "The Night of the Hunter (1955)" 19:30 BST (→18:30 UTC) against the feed `DTSTART;TZID=Europe/London:20260617T193000`.

### Close-Up Film Centre (Shoreditch) — ⚠️ BLOCKED (interactive Cloudflare Turnstile)
- Scraper: `src/scrapers/cinemas/close-up.ts` (fetch + Cheerio; embedded `var shows ='[...]'` JSON on the homepage + `/search_film_programmes/?date=DD-MM-YYYY` pages).
- Date/time format: JSON `show_time` is `"YYYY-MM-DD HH:MM:SS"` (UK local, 24h) → `ukLocalToUTC()`. Search-page date-only values are UTC-midnight → combine with `ukLocalToUTC()` using UTC components.
- **Status as of 2026-06-12: BLOCKED, scraper left UNCHANGED (fails loudly rather than silently).**
  - `https://www.closeupfilmcentre.com` and EVERY path probed (`/`, `/search_film_programmes/?date=...`, `/?ical=1`, `/whats_on/?ical=1`, `/feed/`, `/calendar.ics`, `/whatson.ics`, `/events.ics`) return **403 with `cf-mitigated: challenge`** regardless of UA (browser UA and plain UA both blocked). There is NO unprotected iCal endpoint to fall back to.
  - The challenge is an **interactive Cloudflare Turnstile** ("Verify you are human" checkbox) — confirmed by screenshot — NOT the automatic JS challenge the BFI `createPersistentPage` + `waitForCloudflare` pattern clears. Three attempts failed: (1) headless persistent context (challenge never cleared in 60s); (2) headed persistent context (title stuck on "Just a moment..." for 120s, automated checkbox clicks ignored); (3) warm two-pass headed profile reusing the on-disk `cf_clearance` dir (both passes still "Just a moment..."). rebrowser-playwright's automation fingerprint cannot solve the Turnstile checkbox.
  - The BFI pattern works because BFI uses the *non-interactive managed challenge*; Close-Up's interactive Turnstile is a different, harder class. Options for a future fix (all require approval / new deps): a CAPTCHA-solving service, a residential-proxy + warmed-cookie pipeline, or Camoufox/Patchright (already noted as candidates in `utils/browser.ts`). STOPPED here per the 3-attempt rule.

### The David Lean Cinema (Croydon Clocktower)
- Scraper: `src/scrapers/cinemas/david-lean.ts` (Playwright/`rebrowser-playwright`, Divi/WordPress site).
- Source URL: `https://www.davidleancinema.uk` (homepage carries the full what's-on list).
- Booking: TicketSolve via `tinyurl`/`ticketsolve` links. Most listing blocks carry their own booking link, so the slider title→URL matcher is a fallback only.
- Key selectors: listings in `.et_pb_text_inner`; slider booking map from `.et_pb_slide` (`.et_pb_slide_title` + `a.et_pb_more_button`).
- Date/time format: one film per `.et_pb_text_inner` block; lines are `Title` / `YYYY | Country | NN min` / `<DayName> DD <Month> at <times>` (e.g. `Tues 16 June at 2.30pm and 7.30pm`, sometimes split by a `(HOH)`/`(Relaxed)` parenthetical). Parsed via `parseScreeningDate()` + `parseScreeningTime()` → `combineDateAndTime()`.
- **Zero-yield bug fixed 2026-06-12 (had NEVER returned a screening):**
  1. The date/time regex required a bare 3-letter month (`Jun`); the site writes FULL month names (`June`). `Jun` matched inside `June` but the following `\s+at` then failed → no listing ever parsed. Widened the month alternation to a 3-letter prefix + optional trailing letters (`(Jan|...|Dec)[a-z]*`), widened the day-name group (`Tues`/`Weds`/`Thur`/`Thurs` via `\w*`), and capture the rest of the line as the time blob (`[^\n]*`) so multi-time listings and ones interrupted by `(HOH)` are fully captured.
  2. Listings are read via `innerText` (NOT `textContent`) so the per-line title/metadata/date structure is preserved — `textContent` collapsed everything onto one run (`...105 minFri 12 June...`), breaking title extraction.
  3. `extractTimes()` strips the detailed `HH.MMam` times from the text BEFORE scanning for bare-hour times; otherwise the bare-hour pattern matched the minute half of a detailed time (`2.00pm` → spurious `00pm`), producing phantom 00:xx / next-day screenings.
- Year roll-forward guard retained: only bump a parsed date forward a year when it is >180 days in the past (genuine year boundary); recently-past dates stay in the current year and are dropped by the `>= now` filter (prevents the old ~360-day phantom screenings).
- **Load-bearing format assumption: ONE date per line.** The time blob captures to end-of-line, so a line like "Tues 16 June at 2.30pm and Wed 17 June at 7.30pm" would attribute BOTH times to 16 June and never see the second date. The site doesn't currently do this; if listings change shape, stop the blob at the next day-name token. Regression tests: `david-lean.test.ts`.
- Verified live 2026-06-12: `scrape()` → 49 screenings (was 0), 0 suspect (<09:00 UTC) times. Cross-checked vs site: "Fairyland" 16 June 2.30pm+7.30pm, "Who Framed Roger Rabbit?" 20 June 11.00am, "The Devil Wears Prada 2" 24 June 5.30pm.

### Rio Cinema (Dalston)
- Scraper: `src/scrapers/cinemas/rio.ts`
- Source URL pattern: homepage `https://riocinema.org.uk` (redirects to `/Rio.dll/Home`)
- Approach: all event data is embedded as JSON in the page — `var Events = {"Events": [...]};` — extracted by bracket-matching (the JSON contains HTML strings, so naive regex slicing breaks).
- Date/time format: `Performances[].StartDate` = `"YYYY-MM-DD"`, `StartTime` = `"HHMM"` (24-hour, e.g. `"1800"`). Combined via `combineDateAndTime()` on a UTC-midnight date.
- Metadata per event: `Director` (string), `Year` (string, parsed to int), `RunningTime` (JSON number, minutes — forwarded as `RawScreening.runtime` via `sanitizeRuntime()`, plan 006). RunningTime tolerates string-shaped values defensively.
- Booking URL: film page `https://riocinema.org.uk/Rio.dll/WhatsOn?f={event.ID}` (stable) — NOT `Performances[].URL` (session params expire).
- sourceId format: `rio-dalston-{event.ID}-{ISO datetime}`.
- Known pitfalls:
  - `RunningTime` is the venue's stated event length: for event screenings (film + Q&A/intro) it can exceed the film's true runtime (e.g. "LITTLE SHOP OF HORRORS + event" = 150 vs the film's 94 — a 56 min gap that exceeds the matcher's 30 min tolerance and triggers the −0.15 penalty; exact-year matches typically survive it). See the shared runtime-capture rule above for the asymmetric-tolerance follow-up idea.
  - Titles often carry event prefixes ("Classic Matinee:", "Pink Palace:") — handled downstream by title cleaning.
- Last verified (2026-06-12): live run — 38/38 films emitted runtime, all within 1–600; JAWS=124, RINGU=96 match the venue JSON and canonical runtimes.

### ICA
- Scraper: `src/scrapers/cinemas/ica.ts`
- Source URL pattern: listing `https://www.ica.art/films` → per-film detail pages `/films/{slug}` (capped at 50 per run, 3s delay between fetches).
- Approach: Cheerio over each film detail page.
- Key selectors:
  - `span.title` — film title (nested `.tag/.badge/.label/.flag` removed first to avoid concatenation)
  - `#colophon` — metadata line, format `"<i>Title</i>, dir Director Name, Country Year, Runtime mins."`
  - `.performance-list .performance` with `.time` (`"04:15 pm"`), `.date` (`"Fri, 19 Dec 2025"`), `.venue`
- Metadata from `#colophon`: director (`dir X`), year (4-digit), runtime (`"(\d+)\s*mins?"` — forwarded as `RawScreening.runtime` via `sanitizeRuntime()`, plan 006), country.
- sourceId format: `ica-{slugified title}-{ISO datetime}`.
- Known pitfalls:
  - Excluded listing URLs (year archives, `/films/today`, etc.) are filtered in `isExcludedUrl` — keep in sync if ICA adds new non-film listing pages.
  - One detail-page fetch per film: a full run costs ~50 requests; don't loop live runs.
- Last verified (2026-06-12): live run — 19/21 films emitted runtime (two had no runtime in colophon), all within 1–600.

### Garden Cinema (Covent Garden)
- Scraper: `src/scrapers/cinemas/garden.ts`
- Source URL pattern: homepage `https://thegardencinema.co.uk` (all dates on one page)
- Approach: Cheerio; `div.date-block[data-date="YYYY-MM-DD"]` → `.films-list__by-date__film` cards → `a.screening` time links (24-hour `"HH:MM"`).
- Key selectors:
  - `.films-list__by-date__film__title a` — title (trailing BBFC rating span flattens into the text; stripped end-anchored via `cleanTitle`)
  - `.films-list__by-date__film__stats` — stats line `"Director, Country, Year, Runtime"` (e.g. `"Greta Gerwig, USA, 2019, 135m."`)
  - `.films-list__by-date__film__thumb` — poster `src`
- Metadata from stats line: director (first comma part unless country/year), year (4-digit), runtime (`"135m."`/`"117 mins"` — unit suffix required so the bare year can't match; forwarded as `RawScreening.runtime` via `sanitizeRuntime()`, plan 006).
- sourceId format: `garden-{slug(title)}-{ISO datetime}`.
- Known pitfalls:
  - Rating strip must stay end-anchored (regression: `"What's Up, Doc? U"` → `"What's p, Doc?"` with substring replace).
- Last verified (2026-06-12): live run — 88/88 films emitted runtime, all within 1–600; His Girl Friday=92 matches canonical.

### L-CUT gap-fill (`scripts/lcut-gapfill.ts`, 2026-07-13)
- **What**: L-CUT (https://lcutlondon.com) is a third-party repertory listings guide with an
  unauthenticated JSON API: `GET /api/films/date/DD-MM-YYYY?page=N` → `{films, hasMore}`.
  We diff its listings against our DB and insert only missing screenings, attributed to the
  REAL venue via `VENUE_MAP` (never to an "L-CUT" cinema).
- **Why**: covers venues we don't scrape directly (`the-arzner`, `horse-hospital`,
  `good-shepherd-studios`, `project-loop`) and acts as a coverage benchmark for venues we do.
- **The Arzner ≠ ArtHouse Crouch End** — it's a distinct LGBTQ+ cinema at 10 Bermondsey
  Square SE1 3UN (Jacro-style booking at thearzner.com/TheArzner.dll — direct-scraper
  candidate later). Mapping this wrong would cross-contaminate two venues' programmes.
- **Run**: dry by default; `--execute` to insert; `--days N` horizon (default 35).
  `npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register scripts/lcut-gapfill.ts`
- **Dedup**: skip if same venue has a screening within ±20 min with normalized-title
  equality/containment, or if `sourceId lcut-{id}` already exists. BFI rows are deduped against
  BOTH `bfi-southbank` and `bfi-imax` (L-CUT labels both "British Film Institute").
- **Times**: uses the row's ISO UTC `timestamp` (`timeSource: "iso"`); rows before 09:00
  London are skipped as bad upstream data (seen: "Blue Heron" @ Phoenix 06:00).
- **Pitfalls**: venue names carry emoji/diacritics ("The Arzner 🏳️‍🌈", "Ciné Lumière") —
  normalized before mapping; unmapped venue names are warned loudly, never guessed.
- **Not scheduled** in the nightly pipeline yet — manual runs while dedup accuracy bakes in.

### Rich Mix — Spektrix v3 API (rewritten 2026-07-13)
- Old WP JSON endpoint (`/whats-on/cinema/?ajax=1&json=1`) removed in a site restructure
  (301 → `/cinema/`, params dropped). Scraper now reads the public Spektrix API:
  `https://system.spektrix.com/richmix/api/v3/events` + `/instances?startFrom=YYYY-MM-DD`.
- Film events: `attribute_COGEventProgramme === "FILM"` (venue also hosts music/theatre).
- `startUtc` omits the trailing `Z` — append before `new Date()`. `timeSource: "iso"`.
- Booking URL: `/cinema/{slugified event name incl. rating}/` (e.g. `toy-story-5-pg/`);
  trailing slash avoids a 301. `attribute_VENUE` = screen. `duration` = runtime.
- healthCheck hits the Spektrix events endpoint (the real dependency), not the WP site.

### Close-Up — WAF burst-403s (hardened 2026-07-13)
- The WAF intermittently 403s bursts of `/search_film_programmes/?date=` requests, then
  serves the same URLs fine minutes later. Scraper now retries each page (3 attempts,
  linear backoff) and only weeks 1–4 are load-bearing: far-future page failures shorten
  the horizon with a warning instead of failing the run (homepage embedded `var shows`
  JSON covers the current programme regardless).
- `healthCheck()` overridden to reuse `fetchUrl`'s full browser headers — the BaseScraper
  UA-only GET gets 403'd even when the real scrape works (known false-negative class).
