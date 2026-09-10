# Scraping Playbook

Operational guide for scraper changes and incident response.

## When To Update This File
Update this playbook whenever you:
- Change selectors or extraction logic in a scraper
- Change date/time parsing behavior
- Add a new scraper command or runner
- Discover a recurring site-specific failure mode

## Shared Rules
- **Resume is not necessarily a one-venue retry**: after a failed scrape phase, only completed scraper entries can be skipped. Checkpointed L-CUT/cleanup/audit phases are honored only as a contiguous prefix of completed phases; if scrape did not complete, these downstream phases rerun. The September 9 checkpoint records L-CUT/cleanup/audit but not scrape, so `--resume` does not mean "only Close-Up runs." Checkpoint age/argument validation can instead trigger a full run. Inspect the checkpoint and startup messages before choosing a retry; do not retry a known source block merely to make the run green.
- **Scrape diff is a comparison, not a mutation ledger** (2026-09-10): `scrape-diff.ts` compares trimmed/lowercased film titles plus UTC instants within the next 30 days. Its unmatched incoming/existing rows do not prove inserts, cancellations or deletions. Raw scraper titles can differ from enriched DB titles, including unsafe sequel matches; inspect identities before drawing conclusions. `scraped_at` means last refresh, not creation. The `RECENTLY_REFRESHED_NOT_MATCHED` warning replaces the misleading `RECENTLY_ADDED_THEN_REMOVED`; null refresh timestamps are unknown, not recent. Legacy result fields `added`/`removed` remain comparison-only. Empty-capture blocking and matching behavior are unchanged.
- **L-CUT parity aliases** (2026-09-10): observed labels `Genesis Cinema`, `Bertha DocHouse`, `Coldharbour Blue`, `Peckhamplex` and `BFI IMAX` resolve to their canonical first-party scraper IDs. The scheduled gap-fill's eight source-only write targets are unchanged; these five are parity/report-only. Keep the real-registry classification and no-write orchestration tests when adding aliases. Supervised CLI `--execute` without `--targets` remains broader and is not a safe verification command.
- Always capture full time strings including AM/PM context.
- If a time is `1-9` with no AM/PM, default to PM.
- Treat times before `10:00` as likely parse errors and log warnings.
- Use `src/scrapers/utils/date-parser.ts` for shared parsing behavior.
- Dates passed to `combineDateAndTime()` must be UTC-midnight dates from `parseScreeningDate()` or `Date.UTC(...)`; `date-fns/parse()` returns runtime-local midnight and can shift the screening to the previous day when `combineDateAndTime()` reads UTC components.
- **Yearless dates resolve against today's Europe/London calendar DAY, not the reference instant** (fixed 2026-09-09). `parseScreeningDate("Wednesday 9th September")` keeps the current year all day; only a genuinely earlier calendar day rolls to next year. The old check compared the reference instant with the parsed day's UTC midnight, so from 00:00 onwards *today* looked past: a listing read at 17:00 on 9 September resolved to 2027 and the 90-day horizon then discarded that day's screenings. Worst at New Year's Eve, which jumped a full year. If you add a date format, route it through `parseScreeningDate()` rather than re-deriving a default year from `referenceDate.getFullYear()` — that is host-TZ dependent.

- **Never use `new Date(year, month, day, hours, minutes)` to construct screening datetimes.** That ctor interprets numeric args as the runtime's local timezone, which silently produces +1h offsets during BST when the scraper runs under `TZ=UTC` (cron, CI, container). Always call `ukLocalToUTC(...)` from `utils/date-parser.ts` — it builds UTC explicitly and applies BST. Same goes for `parseUKLocalDateTime()` for ISO-like strings without a timezone suffix.
- After fixing time parsing bugs, verify and clean bad historical screenings (`00:00-09:59`) only when confirmed wrong.
- **`BaseScraper.healthCheck()` retries** (2026-05-15): 3 attempts, 10s timeout each, 4s backoff between attempts. Fast-fails on 4xx (contract issue), retries on 5xx + network errors. Subclasses can override for cheaper/different checks (e.g. Curzon HEADs the API endpoint with a 401-is-healthy contract). Background: Close-Up was failing 33% of runs at 03:17-03:21 UTC because of brief nightly-maintenance windows.
- **Do not turn fetch/parse exceptions into successful empty results.** A valid zero-screening chain venue must remain present in the returned `Map` with `[]`; a failed venue must be omitted and recorded in `venueErrors`. The shared runner marks any requested venue missing from the result map as failed. Multi-page independent scrapers must throw when any required page fails so partial coverage is not persisted as a successful run.
- **Time provenance (plan 010, 2026-06-12; extended 2026-09-10)**: `RawScreening.timeSource` tells the validator what kind of clock it is looking at. It answers TWO separate questions and they must not be conflated. **(1) Can this clock carry an AM/PM error?** Only text parsing can, so both `"iso"` and `"local-24h"` turn `suspicious_time_early` (<10:00) into warn-not-reject. **(2) How far ahead may this source publish?** That is a property of the venue's programming, not of the clock format, so **only `"iso"`** raises `too_far_future` from 90 to 180 days — the chains' API feeds genuinely carry long-lead event cinema (Met Opera 2026-27). `"local-24h"` keeps 90. Unset means `"text"`: full strictness, because a bare 1-9 hour may really be PM. `"iso"` set by: Curzon (Vista API), Picturehouse (API), Everyman (boxofficeapi), Rich Mix (Spektrix `startUtc`), Castle/Castle Sidcup (`data-start-time`), INDY. `"local-24h"` set by: **BFI IMAX only** — its structured clock column, gated per-venue on `clockFormatVerified` and per-field on an anchored range check. **BFI Southbank is NOT set**: its format is unverified (Cloudflare blocked two captures on 2026-09-10). See the BFI section. **Never label a local wall clock `"iso"` to get past an early-time rejection — that silently doubles the venue's date horizon.**
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
| Lexi (`cinemas/lexi.ts`) | `lexi` | `lexi-{film.ID}-{perf.ID}` | Savoy modern-JSON perf ids (NOT Admit One — corrected 2026-07-14) |
| Regent Street (`cinemas/regent-street.ts` → `platforms/indy.ts`) | `regent-street` | `regent-street-{showing.id}` | INDY GraphQL showing id (circuit 19 / site 85) |
| Chiswick (`cinemas/chiswick.ts` → `platforms/indy.ts`) | `chiswick-cinema` | `chiswick-cinema-{showing.id}` | INDY GraphQL showing id (circuit 56 / site 170) |
| Rich Mix (`cinemas/rich-mix-v2.ts`) | `rich-mix` | `richmix-{inst.id}` | Spektrix v3 API instance id (scheme changed 2026-07-13 with the API rewrite; no reconcile needed — 0 upcoming rows existed, old WP endpoint dead since site restructure) |
| JW3 (`cinemas/jw3.ts`) | `jw3` | `jw3-{inst.id}` | API instance id |
| Castle (`cinemas/castle.ts` → `castle-calendar.ts`) | `castle` | `castle-{perfId}` | Jacro perf id |
| Castle Sidcup (`cinemas/castle-sidcup.ts` → `castle-calendar.ts`) | `castle-sidcup` | `castle-sidcup-{perfId}` | Jacro perf id |
| Rio (`cinemas/rio.ts` → `platforms/savoy.ts`) | `rio-dalston` | `rio-dalston-{event.ID}-{ISO}` | Savoy modern-JSON event id + datetime |
| Prince Charles (`cinemas/prince-charles.ts`) | `prince-charles` | `{perfId}` (bare digits from `booknow/(\d+)`); fallback `prince-charles-{titleSlug}-{ISO}` | Jacro perf id; derived fallback added 2026-06-12 so sourceId is never undefined. Bare-digit primary kept deliberately — prefixing would strand all existing rows |
| ICA (`cinemas/ica.ts`) | `ica` | `ica-{titleSlug}-{ISO}` | derived (lowercase, whitespace→dash, punctuation kept) |
| Genesis (`cinemas/genesis.ts`) | `genesis` | `genesis-{perfCode}` | site perfCode |
| Peckhamplex (`cinemas/peckhamplex.ts`) | `peckhamplex` | `peckhamplex-{titleSlug}-{ISO}` | derived; identical whether the film came from `/films/out-now` or `/films/coming-soon`, so the two listings cannot double-insert |
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
| L-CUT gap-fill (`scripts/lcut-gapfill.ts`) | multiple (real venues, incl. `the-arzner`, `horse-hospital`, `good-shepherd-studios`, `project-loop`, `deptford-cinema`, `ibraaz`, `metroland-studios`, `set-social-peckham`) | `lcut-{lcutMongoId}` | L-CUT API film id (`https://lcutlondon.com/api/films/date/DD-MM-YYYY?page=N`) |

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
The `/scrape` slash command runs read-only detectors against `scraper_runs`: three in pre-flight (`detectSilentBreakers`, `detectFlakyCinemas`, `detectYieldDrop`), plus `detectYieldDeltaSinceBaseline` and `detectStaleCinemas` in the post-run report.
- **`detectSilentBreakers`** (`src/lib/scrape-quarantine.ts`) — Prowlarr-pattern: flags cinemas with ≥N *consecutive* `success+0` runs.
- **`detectFlakyCinemas`** (same file, added 2026-05-15) — ratio-based: flags cinemas whose last `lookback` runs have ≥X% `success+0` or `failed`. Catches alternating empty/non-empty patterns that the consecutive detector misses. Default thresholds: `emptyRatioWarn=0.3, emptyRatioCritical=0.5, failedRatioWarn=0.3, failedRatioCritical=0.5, minRuns=4, lookback=10, maxAgeDays=30`. Implemented as a single windowed SQL (ROW_NUMBER OVER PARTITION).
  - `lookback` is a *count* window, so on its own it spanned a low-volume cinema's whole lifetime and fixed failures never aged out (Cinema Museum read 38% flaky off three June failures fixed on 2026-06-12 by PR #671, out of 8 lifetime runs). `maxAgeDays` is applied **inside** the ranking CTE, before `ROW_NUMBER()`, so out-of-window runs cannot consume a `lookback` slot. Effective window is `min(lookback, runs in the last maxAgeDays)`, which makes `minRuns` a recency gate too.
  - `detectYieldDrop` and `detectYieldDeltaSinceBaseline` still have no age bound (see below).
- **`detectYieldDrop`** (same file, added 2026-05-15) — compares recent avg `screening_count` against a trailing baseline. Catches "success+low-but-non-zero" regressions that look healthy to the other two detectors (e.g. BFI PDF parser silently dropping one venue's screenings — 200 → 30). Default thresholds: `recentWindow=5, baselineWindow=20, minBaselineAvg=20, dropRatioWarn=0.5, dropRatioCritical=0.3`. Only considers `status='success'` rows so failures/empties don't pollute the math.
  - **Known gap (unfixed):** no age bound, and because it skips non-success rows the "recent" window can be arbitrarily old. Measured 2026-08-09: Rich Mix's recent window reached back 54.7 days against a baseline reaching 71.7 days; BFI IMAX/Southbank 23.7 days against 59. It fires on nothing today, but do not read its output as "recent".
- **`detectYieldDeltaSinceBaseline`** — post-run "current vs 7-day mean" surfacer. **Known gap (unfixed):** its `latest` anchor is the most recent successful run *of any age*, while the report header says "in latest run". Measured 2026-08-09: it treated 20-day-old runs as "latest" for Phoenix, Rich Mix, Bertha DocHouse and Chiswick.
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
  - **"Boutique venue shows only ~2 films live" is NOT under-scraping (audit 2026-07-20):**
    Mayfair's `curzon.com/venues/mayfair/` day-view surfaces only first-run films ~1 week out
    and returns "NO SHOWTIMES AVAILABLE" further out, but the Vista API for `MAY1` genuinely
    publishes event cinema months ahead (Met Opera, Curzon Film 50 season, RBO ballet). Live
    probe: MAY1 → 57 screenings / 19 films through Nov, matching our DB. All sourceIds are
    `curzon-MAY1-*` (attribution is correct — the `showtimes/by-business-date?siteIds=MAY1`
    filter is honoured; showtime ids are venue-prefixed). A verification pass that reads only
    the venue day-view will mis-flag our correct rows as a stale over-count. Confirm against
    the API before any cleanup.
  - **Horizon is a CALENDAR cap, not a date-count cap (fixed 2026-08-10).** `scrapeVenueViaApi`
    now keeps every published business date within `HORIZON_DAYS = 70`
    (`dates.filter(d => d <= cutoff)`), replacing `dates.slice(0, 30)`.
    Why the old cap was actively harmful: Vista returns only dates that have something
    programmed, so a count cap made the horizon vary *inversely* with how busy a venue is.
    A venue screening something nearly every day spent its 30 entries in ~30 days, while a
    venue whose list is mostly sparse advance-sale opera dates spread 30 entries across a
    year. Measured 2026-08-09: **Bloomsbury published 58 dates and we stopped at day 38**,
    dropping 12 screenings inside the next 60 days (NT Live, Met Opera, DocHouse strands),
    while **Mayfair reached day 167**. The busiest venue got the shortest horizon — the
    exact opposite of intent. After the fix Bloomsbury went 159 → 315 rows and 29 → 39
    dates (to 2026-10-17), and Soho gained the one date it was short (2026-09-30); Aldgate,
    which publishes only 20 dates, is unchanged because it was already taking everything.
    Chain re-scrape: 10/10 venues, +901 added / 805 updated. Filtering by date is also
    self-bounding — at most `HORIZON_DAYS + 1` showtime requests per venue.
  - **Known trade-off of the calendar cap:** rows beyond 70 days are no longer refreshed, so
    a far-future one-off (a Met Opera date in January, say) persists from whenever it was
    last scraped and will not be removed if cancelled. Pre-existing rows past the cutoff
    were deliberately left in place — they are valid published screenings and
    `.claude/rules/database.md` forbids deleting valid future ones. If that staleness
    matters, take the union of "within 70 days" and "first N dates" rather than raising
    `HORIZON_DAYS`, which would multiply requests for the dense venues without helping the
    sparse ones.
  - **Do not run the weekly scrape on a Sunday.** Curzon publishes each Friday→Thursday week
    early in the preceding week. A run at 20:58 on Sunday 2026-08-09 captured only 1–2
    advance showtimes for 08-14..08-20, while a replay 26h later (Monday evening) returned
    16/day across that same window — 99 missing screenings at Aldgate alone, with
    `ghosts: 0`, i.e. nothing had been lost, the data simply did not exist yet. Mid-week
    (Wed–Thu) is the right cadence for the release-driven chains, and this is worth more
    coverage than several scraper fixes.
  - `siteIds` in `showtimes/by-business-date/{date}?siteIds=X` is plural. If it accepts a
    comma-separated list, one request per date could cover all 10 venues and cut chain
    request volume roughly 10x while keeping the wider horizon. Unverified — worth testing.
- Metadata: `relatedData.films[].runtimeInMinutes` (integer minutes) is forwarded as `RawScreening.runtime` via `sanitizeRuntime()` (plan 006, 2026-06-12). Year comes from `releaseDate`, director from `castAndCrew` cross-referenced against `relatedData.castAndCrew`.
- Last verified (2026-03-18): SSR token extraction working, all venues returning data

### Barbican
- Scraper: `src/scrapers/cinemas/barbican.ts`
- Source URL pattern: `https://www.barbican.org.uk/whats-on/cinema?day=YYYY-MM-DD`
- Approach: Daily cinema listing page (Cheerio, static HTML). One sequential request per day, 3s apart; 70 days measured at ~222s wall clock (2026-08-09), inside `VENUE_TIMEOUT_MS` (10 min).
- **No browser needed.** The `?day=` endpoint is server-rendered and returns 200 to a plain `fetch` with the standard scraper headers — verified for every date from +0 to +145 (2026-08-09), zero Cloudflare challenges. The "Barbican needs vision/Playwright for its React grid" note in the root CLAUDE.md is about a *different* surface and does not apply here.
- Date/time format: Times displayed as "12.00pm", "5.55pm" (dot separator, 12-hour with am/pm). `parseScreeningTime()` accepts both `.` and `:` separators; the scraper's `.replace(".", ":")` is belt-and-braces.
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
  - **Day range**: The nav shows ~7 days but the `?day=` parameter accepts any future date. We scrape **70 days ahead** (`DAYS_AHEAD`). Was 30, which capped the venue at ~28 days of coverage; a 2026-08-09 replay went 25 days → 44 days and 75 → 103 screenings on the bump. Barbican publishes further still (furthest listing seen 2026-11-22, ~105 days out) — 70 is a deliberate stop at the ~2-month product target, since every extra day is another sequential request.
  - **Time lives in a nested span**: the booking `<a>` contains `<span><svg/></span><span>2.15pm</span>`. Read the **`<a>`'s** full `.text()` — an inner-node read can lose the meridiem, and the surrounding `.cinema-instance-list__instance` text is polluted with accessibility tooltip prose ("CAP Captioning assists…"), which breaks `parseScreeningTime()`'s anchored regexes.
  - **Walk London days, not UTC days**: `new Date().toISOString().split("T")[0]` is the *UTC* date. Run between 23:00 and 00:00 London during BST it starts the walk on yesterday — one wasted request on a day whose screenings all fail `validate()` as past, and one day lost off the far end. `barbican.ts` uses a local `londonDateKey()` that anchors at noon UTC so stepping is DST-safe (an identical private copy lives in `platforms/indy.ts`; consolidating into `utils/date-parser.ts` is a follow-up).
  - **No pagination**: day pages render every card for that day; there is no pager or "load more" (checked `.pager`, `[rel=next]`, `a[href*='page=']` — no matches).
  - **Failure handling**: each day page gets `FETCH_ATTEMPTS = 2` (one retry, 4s backoff) so a single 5xx/reset cannot cost the venue its whole run; any day still failing after that fails the run, so a partial scrape is never recorded as success. `MAX_CONSECUTIVE_FAILURES = 3` aborts the walk early when the site is down or rate-limiting, bounding worst-case wall clock under the per-venue cap.
  - **Silent drops are logged**: instances yielding no readable time are counted and warned per day. Measured 0 across 12 days sampled +0…+69 (2026-08-09) and 0 across a full 70-day run, so any warning means the markup moved.
  - **Old performances endpoint**: The `/whats-on/event/{nodeId}/performances` page still works but its `datetime` attribute has a misleading `Z` suffix — the values are actually UK local time, not UTC. The old scraper used `new Date(attr)` which was off by 1 hour during BST.
  - **BBFC certificate in titles**: Raw titles carry a trailing certificate like `"(12A)"`, which the title cleaner strips. Deliberately NOT captured (plan 006 YAGNI decision, 2026-06-12): `RawScreening` has no certificate field, the matcher doesn't consume certificates, and `films.certification` is filled by TMDB enrichment. Revisit only if a consumer lands.
- Last verified (2026-08-09): 70-day `?day=` walk replayed live — 103 valid screenings over 44 distinct days, furthest 2026-10-17 16:00 London, 0 screenings before 10:00, 0 unreadable instances, 103/103 distinct sourceIds. Far-edge spot check against the site: 2026-10-17 shows Kiki's Delivery Service 11.00am, King Kong vs. Godzilla 2.00pm, King Kong Escapes 4.00pm — matches the scrape exactly.
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
- Notes: pure `fetch` against Everyman's `gatsby-source-boxofficeapi` — **no Playwright, no browser**,
  so it runs under plain `tsx`. (The registry lists `scraperType: "playwright"` for these venues,
  which is a stale label; nothing in the scraper launches a browser.)
- Failure handling: scheduled-movie, movie-detail, and schedule API errors are recorded in `venueErrors`; a valid empty schedule remains a successful `[]` result.
- **URL patterns** (3 calls per venue, in order):
  - `GET /api/gatsby-source-boxofficeapi/scheduledMovies?theaterId={ID}`
    → `{ movieIds: { titleAsc[], releaseAsc[], releaseDesc[] }, scheduledDays: { [movieId]: ["YYYY-MM-DD", …] } }`.
    **`scheduledDays` is keyed by movie id, not by date** — the values are the dates. This is the
    cheapest way to read a venue's publication horizon (~0.5–5KB, one request, no schedule call).
  - `GET /api/gatsby-source-boxofficeapi/movies?basic=false&castingLimit=0&ids=…&ids=…` → `MovieInfo[]`.
  - `GET /api/gatsby-source-boxofficeapi/schedule?from={ISO}&to={ISO}&theaters={urlencoded JSON}`
    where `theaters` = `{"id":"X0X5P","timeZone":"Europe/London"}`. Response is
    `{ [theaterId]: { schedule: { [movieId]: { "YYYY-MM-DD": ShowtimeData[] } } } }`.
- **Schedule window — 70 days, ONE call, no chunking (measured 2026-08-09):**
  `SCHEDULE_WINDOW_DAYS` was 45; that was **our** cap, not the venue's. Empirically:
  - A single schedule call accepts a 70-day range, and a 110-day range, with **no range capping
    and no chunking required** — `dates`/`max date` in the response grow monotonically with `to`.
  - Payload and latency growth are negligible: King's Cross `X0X5P` 53.4KB→54.1KB (+1.3%),
    Barnet `X06SI` 119.4KB→120.9KB (+1.3%); durations 0.1–1.8s, dominated by jitter not range width.
  - Chain-wide effect of 45→70: **1214 → 1225 screenings (+11, +0.9%)**, furthest date
    2026-09-23 → 2026-10-17, distinct dates 36 → 40. Verified a strict superset (0 rows lost,
    0 datetime drift, 0 duplicate `sourceId`s).
  - The gain is small in count but is exactly the content worth having: all 11 new rows are
    advance-booking live broadcasts (`National Theatre Live: The Misanthrope` across 8 venues,
    `Met Opera 2026-27: Così fan tutte` / `Macbeth`). Regular film programming genuinely stops
    at ~6 weeks ("new films every Tuesday"), so raising the window mainly rescues event cinema.
  - Venues that gained at 70d: barnet +2, belsize-park +2, brentford/hampstead/kings-cross/
    maida-vale/muswell-hill/screen-on-the-green/stratford +1 each. Flat: baker-street,
    borough-yards, broadgate, canary-wharf, chelsea, crystal-palace, the-whiteley.
  - **More is available but deliberately not fetched.** Per-venue horizons from `scheduledDays`:
    most venues publish to ~2026-11-24 (~107 days); barnet/belsize-park/brentford/hampstead/
    muswell-hill list isolated dates into 2027-05/06. Two venues publish far less than 70 days
    (baker-street ~27d to 2026-09-05, broadgate ~42d to 2026-09-20) — that is the venue's own
    horizon, not clipping. Target horizon is ~70 days; don't widen further for the sparse tail.
- **Everyman Walthamstow is permanently closed — `active: false` is correct (confirmed 2026-08-09).**
  It IS present in `EVERYMAN_VENUES` and in `THEATER_IDS` (`walthamstow` → `X0WT1`), and
  `cinema-registry.ts` carries `chainVenueId: "X0WT1"`, so nothing is "missing from the venue list".
  Its 0 upcoming screenings are the correct state, not a scraper bug:
  - `scheduledMovies?theaterId=X0WT1` → **HTTP 500**, body `null`. `schedule` with `X0WT1` → **HTTP 500**, body `null`.
    An identical schedule call for `X0712` returns HTTP 200 with data, so the request form is right —
    the theater id itself is dead in Everyman's system.
  - `https://www.everymancinema.com/venues-list/x0wt1-everyman-walthamstow` → **HTTP 404**
    (`<title>Page Not Found — Everyman Cinema`), no "walthamstow" string in the body.
  - `/venues-list/` lists **48 Everyman venues UK-wide and no Walthamstow entry at all**, so there is
    no replacement theater id to migrate to. Do not invent one. If it ever reopens it will appear
    in `/venues-list/` with a real id; only then flip `active: true` in both `everyman.ts` and
    `cinema-registry.ts`.
  - The 48-venue list also confirms our London coverage is complete: the 16 London venues on
    Everyman's own site are exactly our 16 active ones (Egham/Gerrards Cross/Esher/Walton/Oxted/
    Reigate etc. are outside London).
- **Screen on the Green venue-website slug (fixed 2026-07-20):** the display
  `website` in `src/config/cinema-registry.ts` was `.../venues-list/x077o-screen-on-the-green`
  (missing the `everyman-` segment every other Everyman venue has), which 404s. Corrected to
  `.../venues-list/x077o-everyman-screen-on-the-green`. This is the DISPLAY field only — the
  scraper itself keys off the boxofficeapi `theaterId` (`X077O` in `THEATER_IDS`), not the
  website URL, so coverage was never affected. NB `scripts/data-check.ts` builds its Everyman
  verification URL as `venues-list/${cinema_id.replace("everyman-","")}` which yields a broken
  slug for ALL Everyman venues (pre-existing, separate from this fix; not the display field).
- **"Far-out event cinema is real, not stale" (audit 2026-07-20):** the venue's own booking
  widget only surfaces the immediate ~10-day window ("new films every Tuesday"), but the
  boxofficeapi genuinely publishes special/event screenings (Mitski, MUBI Secret, anniversary
  screenings, Q&As) weeks ahead. A live-verification pass that only reads the venue day-view
  will UNDER-count and mis-flag our correct rows as a stale over-count — confirm against the
  API (`scrapeVenue`) before deleting. Same pattern as Curzon below.

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
- **The protection is a TOGGLE the venue flips, not a one-way door (established 2026-08-09).**
  Timeline: BLOCKED 2026-06-12 → **OFF** 2026-08-05 (a measurement that session recorded three
  header shapes all returning 200 with no `cf-mitigated`, which is why the scraper still uses plain
  fetch) → **ON again 2026-08-09 19:26Z**, still on at 21:0xZ. Coverage in the DB stops at
  2026-08-31 with `scraped_at` from the last unblocked run. So: the venue is not permanently lost,
  and the scraper is not broken. Expect this to flip again.
- **Re-measured 2026-08-09 (~21:00Z), all four probes 403 `cf-mitigated: challenge`, `server: cloudflare`:**
  1. Plain fetch, exact `fetchUrl` headers → **403**, `title="Just a moment..."`, 5.7KB.
  2. Plain fetch on `/search_film_programmes/?date=…` → **403**, same shape.
  3. Plain fetch with a *fuller* browser header set (`Sec-Fetch-*`, `sec-ch-ua*`, `Upgrade-Insecure-Requests`, `Accept-Encoding`) → **403**. Header shape is NOT the lever; it never was.
  4. Stealth: `createPersistentPage()` + `waitForCloudflare()` → `goto` **403**, title stuck on
     `"Just a moment..."` for the full 120s poll; `createPage()` (full anti-detection suite) →
     identical. Challenge HTML carries `cType: 'managed'` + `cf-turnstile` + `_cf_chl_opt`, and the
     screenshot shows the interactive **"Verify you are human" checkbox**. Same result as the three
     approaches tried 2026-06-12 (headless persistent, headed persistent, warm two-pass profile).
  **Do NOT switch this scraper to the browser path.** It fails identically and would add a
  Playwright dependency (11 navigations per run) for zero screenings. Do NOT add a paid proxy.
- **It is Close-Up's own config, not our IP's Cloudflare reputation** — the obvious competing
  hypothesis, and it is wrong. One GET per host across all 25 plain-fetch venue base URLs
  (2026-08-09, 4s apart): **25/25 → HTTP 200, zero `cf-mitigated`**, including six Cloudflare-fronted
  hosts (barbican.org.uk, chiswickcinema.co.uk, everymancinema.com, olympiccinema.com,
  picturehouses.com, richmix.org.uk) and a `bfi.org.uk` control. Close-Up was the only 403 in the
  sweep. **No other venue is affected — do not "fix" any of them.**
- **TicketSource is not a usable fallback**: booking URLs point at `www.ticketsource.com/close-up-cinema/e-{code}`,
  but that organiser listing and an individual event page both return **403 `cf-mitigated: challenge`**
  (`cType: 'managed'`) to plain fetch too — TicketSource's own bot policy, unrelated to the venue.
- **L-CUT already covers this venue and IS reachable — the recommended fallback.** `scripts/lcut-gapfill.ts`
  maps `"close-up film centre"` → `close-up-cinema`, and the L-CUT API returns Close-Up rows with real
  `timestamp`s and the venue's own `closeupfilmcentre.com` film URLs. Sampled 2026-08-09 (8 dates):
  day+1 → 3, +3 → 2, +7 → 3, +14 → 2, +21 → 4, and **0 at day+30/+45/+60** — i.e. L-CUT's Close-Up
  horizon ends ~2026-08-31, matching the venue's genuine ~3-week publication window. So gap-fill would
  restore essentially FULL coverage, not a degraded subset. It does not do so today only because
  `classifyLcutTargets()` inserts for *source-only* venues and treats a venue with a first-party
  scraper as a regression signal instead. Wiring a "first-party scraper is hard-blocked → promote to
  source-only" path is the fix worth doing; it is out of scope here (it touches `scripts/lcut-gapfill.ts`
  and the pipeline, not this scraper).
- **Current failure behaviour (correct, leave it):** the homepage is fetched first and outside any
  per-week `try`, so a block throws before any screening is produced — a partial batch can never reach
  `processScreenings`, so superseded-cleanup cannot delete the venue's existing rows. Measured
  2026-08-09: `scrape()` throws after 18.6s / 3 requests, 0 screenings.
  The thrown message now names the Turnstile blocker and points here, because a bare
  `HTTP 403: Forbidden` was misread as a transient WAF blip twice (2026-06-12, 2026-08-09).
- **`healthCheck()` override removed 2026-08-09.** Both halves of its rationale had become false:
  `BaseScraper.healthCheck` now sends `fetchUrl`'s exact headers with the same 30s timeout, and a 403
  here is a *real* block, not a false negative. It also had nothing left to defend — the
  `runner-factory` precheck is advisory-only and cannot veto a scrape. All it bought was 3 doomed
  attempts plus 12s of backoff on a 403 that base fast-fails in one request: measured
  **`healthCheck()` 16.4s / 3 requests → 0.2s / 1 request, same `false`**.

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
- **Two coverage/title bugs fixed 2026-07-20 (audit):**
  1. **Bare-hour times dropped whole blocks.** The DOM-level filter required a
     time WITH minutes right after "at" (`at\s+\d{1,2}[.:]\d{2}\s*(am|pm)`). A
     block whose first showtime was a bare hour — e.g. Toy Story 5's
     `Thurs 20 Aug at 11am, 2.30pm (HOH) and 7.00pm` — never entered the
     listings and its 3 screenings were silently missed. Minutes are now
     OPTIONAL in that filter (`at\s+\d{1,2}([.:]\d{2})?\s*(am|pm)`), matching
     what `parseListingText` and `extractTimes` already tolerate.
  2. **"Special screenings" announcement blocks captured the intro sentence as
     the film title.** These blocks put a SENTENCE on line 0 and embed the real
     title AFTER the times on each date line:
     `Wednesday 05 August at 7.00pm - ALL OF US STRANGERS plus Q&A`. The parser
     assumed one film per block (title = line 0) and applied the sentence to
     every screening (producing "films" titled `We have two special screenings
     in August which include Q&A's:`). `splitEmbeddedTitle()` now splits the
     post-"at" blob on the first ` - ` and uses the embedded title (minus a
     trailing `plus Q&A`) when present; normal blocks with no ` - ` keep the
     block title. Multiple films per block are therefore supported.
- Verified live 2026-06-12: `scrape()` → 49 screenings (was 0), 0 suspect (<09:00 UTC) times. Cross-checked vs site: "Fairyland" 16 June 2.30pm+7.30pm, "Who Framed Roger Rabbit?" 20 June 11.00am, "The Devil Wears Prada 2" 24 June 5.30pm.
- Verified live 2026-07-20: `scrape()` → 42 screenings, 25 titles, Toy Story 5 present (11:00/14:30/19:00 on 20 Aug), special-screening titles resolved (ALL OF US STRANGERS 5 Aug, COME SEE ME IN THE GOOD LIGHT 18 Aug), 0 sentence-titles, 0 sub-10:00 times. DB cleanup removed 2 sentence-title "films" (4 screenings) + 4 stale `00:00` phantom rows (pre-fix `11.00am`→`00am` era; correct 11:00 rows coexisted, so no coverage lost).

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
- **Why**: covers venues we don't scrape directly (the source-only set below) and acts as a
  coverage benchmark for venues we do.
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
- **Scheduled** (2026-07-14) as a phase in the weekly `/scrape` orchestrator
  (`src/scripts/run-scrape-and-enrich.ts`, "Phase 1b") — runs AFTER the scrape wave (so
  parity reflects fresh data) and BEFORE cleanup (so inserted rows get enriched). There is
  no cron in this repo by policy ("nothing runs off the Mac"); `/scrape` IS the weekly
  cadence. The reusable core is `runLcutGapfill()`; `scripts/lcut-gapfill.ts` is the
  supervised CLI (`npm run lcut:gapfill`, `--targets id1,id2` to narrow the execute set).
- **Source-only vs scraped** (the scheduled phase's key rule): venues WITHOUT a first-party
  scraper are auto-inserted; venues we DO scrape are **report-only** — a scraped venue >5
  missing vs L-CUT is a scraper-regression signal (warn-level Telegram). Auto-inserting
  scraped venues would mask the regression, so we don't. The split is derived at runtime from
  the scraper registry (`getScrapedCinemaIds`), so a venue auto-reclassifies when it gains a
  scraper. Source-only set as of 2026-08-09 (8 venues): `the-arzner`, `horse-hospital`,
  `good-shepherd-studios`, `project-loop`, `deptford-cinema`, `ibraaz`, `metroland-studios`,
  `set-social-peckham`.

#### Adding a venue to the gap-fill (no scraper) — the 2-file recipe
Worked example: the four venues added 2026-08-09. Nothing else is needed; there is no
scraper module, no `SCRAPER_REGISTRY` entry, and no wave assignment.
1. `src/config/cinema-registry.ts` — append to the "Venues sourced via the L-CUT gap-fill"
   block with `scraperType: "api"`, `scraperModule: "external/lcut-gapfill"`,
   `scraperFactory: "lcutGapfill"`, `active: true`. `scraperModule`/`scraperFactory` are
   documentation only here — nothing imports that path.
2. `scripts/lcut-gapfill.ts` `VENUE_MAP` — key is `normalizeVenueName(rawLcutName)`
   (lowercase, diacritics + emoji stripped, whitespace collapsed). Never hand-compute it;
   print it. Without this key the venue stays in the "UNMAPPED L-CUT venues" warning and
   nothing is inserted, registry entry or not.
3. Then `npm run db:seed -- --cinemas` before the next gap-fill run — `processScreenings`
   inserts against the `cinemas` FK, so an unseeded venue loses its rows. `seed-cli.ts` reads
   the registry via `getCinemasSeedData()` (since 2026-07-14), so there is no second list to
   edit. The older "seed-cli does not read cinema-registry" note is stale.
`scripts/lcut-gapfill.test.ts` pins the source-only set against the real registry, so both
files must move together or the build goes red.

#### The 2026-08-09 additions — first-party scraper notes (deliberately not built)
All four are L-CUT-sourced only. Each has a cheap scrape path if the gap-fill under-covers it;
none was judged to pay for itself at ~12-20 screenings a year.
- **`deptford-cinema`** (Deptford Cinema, deptfordcinema.org) — Squarespace. Events JSON at
  `/new-events?format=json&month=August-2026` → `items[]` with `title`, `startDate`/`endDate`
  (epoch ms), `excerpt`, `categories`, `fullUrl`, `pagination.nextPage` to walk months. No
  browser needed. Booking is TicketSource — **403 Cloudflare on plain curl, don't scrape it**;
  take the booking URL from the event body only. The strong argument for a scraper here is not
  volume but the per-event `location` object: this collective has **no fixed address** (it gave
  up its premises in 2020; currently a monthly residency at The Brookmill, previously The Ivy
  House in Nunhead), so the registry's static pin will go stale and only the JSON tracks it.
  L-CUT was carrying 2 of the 4 screenings the venue advertised at time of adding.
- **`ibraaz`** (Ibraaz, ibraaz.org) — Nuxt but fully server-rendered; Cheerio-friendly.
  `/whats-on?category=film` filters to film. `article.card` → `.tag--themed` (= "Film"),
  `h3 a.title`, `p.line--bold` (director), `time.card__dates`. **Do not trust
  `time[datetime]`** — an archived card renders `2026-07-26T15:00:00+00:00` as "3–4:30pm",
  so parse the human string as Europe/London. Screening room is "Minassa". Tickets are Ticket
  Tailor on `tickets.ibraaz.org`, which is Cloudflare-403 — booking URL only. No past-events
  archive. Watch the times: L-CUT had two Aug 2026 rows an hour earlier than the venue's own
  published 3pm start.
- **`metroland-studios`** (Metroland Cultures, metrolandcultures.com) — WordPress with an open
  REST API and a custom post type: `/wp-json/wp/v2/event?per_page=100&orderby=date`. **A
  venue-site scraper would miss nearly all the film**: the monthly Majlis Film Club is
  programmed and ticketed by the resident collective Other Cinemas on Eventbrite, and the
  venue's own `event` feed had nothing newer than 2026-01-08. If this ever needs a scraper the
  target is the Other Cinemas Eventbrite organiser feed — i.e. a *promoter* scraper, not a
  venue one.
- **`set-social-peckham`** (SET Social, setspace.uk) — WordPress + The Events Calendar with a
  live public REST API: `/wp-json/tribe/events/v1/events?categories=Screening` gives `title`,
  `start_date`, `utc_start_date`, `url`, `cost`, `categories[]` and a nested `venue` object.
  **Filter on `venue.venue === "SET Social"`** — the same feed serves SET Vault/Woolwich,
  Lewisham, Wimbledon and Vauxhall. The `Screening` category is not film-clean (it carried
  four 2026 World Cup football screenings), so a non-film exclusion pass is required. Booking
  fans out to Outsavvy and Eventbrite, so the Tribe API is the only aggregation point.
  Revisit if the Nov–Dec 2026 SET Film Festival (five weeks) lands and L-CUT misses part of it.

### Rich Mix — Spektrix v3 API (rewritten 2026-07-13)
- Old WP JSON endpoint (`/whats-on/cinema/?ajax=1&json=1`) removed in a site restructure
  (301 → `/cinema/`, params dropped). Scraper now reads the public Spektrix API:
  `https://system.spektrix.com/richmix/api/v3/events` + `/instances?startFrom=YYYY-MM-DD`.
- Film events: `attribute_COGEventProgramme === "FILM"` (venue also hosts music/theatre).
- `startUtc` omits the trailing `Z` — append before `new Date()`. `timeSource: "iso"`.
- **Booking URL: `/book/instance/{numericId}`** where `{numericId}` is the LEADING numeric run
  of the Spektrix instance id (`1904605ACPR…` → `/book/instance/1904605`). This is the stable
  per-screening deep link the live `/cinema/` listing itself uses; it always resolves (200).
  Do NOT guess `/cinema/{slugified event name}/` — that 404'd for a large fraction of the venue
  (fixed 2026-07-20). Rich Mix sets WP slugs independently of the Spektrix event name and the two
  disagree on the BBFC rating (`The Odyssey (15)` → WP `the-odyssey-12a`; `Spider-Man: Brand New
  Day (12A)` → WP `spider-man-brand-new-day-u`), plus Spektrix carries pre-launch staging events
  (`TEST The Invite`) with no WP page. `attribute_VENUE` = screen. `duration` = runtime.
- **healthCheck retries 3× (4s backoff)** — the earlier single-shot probe was the root cause of
  Rich Mix's "critical flaky" status (nearly every ~03:xx-UTC run failed at "site not accessible"
  when one probe to `system.spektrix.com` blipped — it occasionally serves an HTML error page
  instead of JSON — even though the venue recovers within seconds; manual daytime runs succeeded).
  It hits the Spektrix events endpoint (the real dependency), not the WP site.
- **A 2026-09-09 read-only capture of what the source held.** The 2026-09-08 baseline parsed ONE
  screening; one parsed screening identifies no layer on its own. Captured that day:
  `/instances?startFrom=2026-09-09` returned **12 instances in its response** — no pagination
  headers, `content-length` equal to the body, `&startTo=+60d` returned the identical 12, and a
  re-check 11 minutes later was byte-identical — of which exactly **one** sat on a FILM event
  (9 LIVE, 2 CE). `/events` carried **354 events, 262 FILM**. Six sampled FILM events (The
  Odyssey, Spider-Man: Brand New Day, Wuthering Heights and three others, all `isOnSale`) each
  returned **zero** future instances via `/events/{id}/instances`; the newest film instance in
  that sample was **2026-08-27**.
- **Endpoint contract, from the vendor docs — not from missing headers.**
  [apieventfiltering](https://integrate.spektrix.com/docs/apieventfiltering) describes
  `v3/instances` as a collection query and recommends bounded date filters to limit response
  size (`startFrom`, `startTo`, `eventName`, `attribute_*`, `eventattribute_*`), and
  [API3](https://integrate.spektrix.com/docs/API3) describes collection resources as exposing all
  of a resource type subject to the query. No pagination mechanism is documented; the stated
  caveat is response **size**, not truncation. So `?startFrom=<today>` is documented to return
  every future instance. Absent `Link`/`Content-Range` and a matching `content-length` only
  corroborate that the body arrived whole — on their own they would prove nothing about
  exhaustiveness. Documentation is a vendor statement, not a measurement of this tenant's data.
  Our `/events/{id}/instances` probes passed no parameters and so returned each event's full
  history, which matches what we saw.
- **Independent discovery check (route not the Spektrix API).** `robots.txt` allows it;
  `sitemap.xml`, regenerated `2026-09-09T20:15:49+01:00`, carries 53 URLs and exactly **one**
  `/cinema/<detail>` page — `premiere-we-set-the-house-on-fire`, the same single film the API
  returned — plus 7 `/live-events/<detail>` pages, consistent with the API's 9 LIVE instances.
  Read this as **corroboration from a second route**, nothing stronger: a sitemap is a
  CMS-generated index and need not enumerate everything a site publishes, so it cannot prove the
  website is not advertising a programme the API misses. No other route is ruled out and no
  cause is established.
- **What that does and does not show.** It records the source state on 2026-09-09 and the
  parser's behaviour on it. It does **not** show what the source held on 2026-09-08 — that
  payload was never captured — so it cannot establish whether the baseline run's extraction was
  right or wrong. Nor does a low denominator by itself establish a cause: an unpublished
  calendar, a changed publishing route and a discovery fault elsewhere would all look like this
  from here. The latest instance among six sampled catalogue films was 2026-08-27,
  not a venue-wide cutoff: the response also includes a different film on 2026-09-09.
- No extraction fault was demonstrated, so none was fixed and no detection heuristic was added.
  `parsePages` logs stage counts only — `N events (M film), P future instances (Q on film
  events)` — so the next reader can see where the funnel narrows without re-deriving it. The
  counts assert no cause and change nothing about which screenings are emitted.
- Offline replay fixture: `src/scrapers/cinemas/__fixtures__/rich-mix/` (the real 2026-09-09
  responses with URLs, status, byte counts and sha256 in `PROVENANCE.json`; events reduced to 40
  of 354, instances complete). `rich-mix-v2.test.ts` replays them through the production
  `parsePages`, never a copy.
- `/events/{id}/instances` returns one event's full instance history — the endpoint that settled
  the per-film question here, and the one to reach for next time.

### BFI IMAX — structured clock provenance (2026-09-10). Southbank NOT included.
- **Scope: IMAX only.** `mapRows` is shared by both BFI venues, but only IMAX's clock format has
  been captured. Southbank keeps full text strictness and earns no provenance.
- `mapRows` reads AudienceView's embedded `searchResults` array. Column **[8] is a zero-padded
  24-hour LOCAL wall clock** (`"09:00"`, `"20:30"`); [9]/[10]/[11] are day / 0-indexed month /
  year, fed to `ukLocalToUTC`. Column [7] is the display string
  (`"Saturday 12 September 2026 09:00"`) and is only a fallback.
- **Format evidence (bounded read-only capture, 2026-09-10, HTTP 200, full-page sha256 in
  `src/scrapers/cinemas/__fixtures__/bfi/PROVENANCE.json`).** Across all 91 IMAX rows the hour
  histogram was `{9:12, 10:6, 11:3, 13:13, 14:8, 15:1, 17:17, 18:5, 19:2, 20:19, 21:2, 22:1,
  23:2}`. Hours up to **23** occur, so a 12-hour clock is excluded; sub-ten values are written
  `09:00`, never `9:00`; no am/pm text appears in the column. **`09:00` here is unambiguously
  morning.**
- **Why this mattered.** The 2026-09-09 run found 91 IMAX rows and rejected **12** — every one
  "The Odyssey" at hour 9 — as `suspicious_time_early`
  (`scrape-full-20260909-221554.log:6845-6857`, `Total: 91 | Valid: 79 | Rejected: 12`). Those
  are consistent with the validator rejecting genuine morning shows, given the next-day
  format evidence; the historical response was not captured, so their correctness is inferred.
- The structured path sets **`timeSource: "local-24h"`** behind **two** gates, so those screenings
  are kept with a warning:
  1. **Per-venue** — `BFIVenueConfig.clockFormatVerified`, set for **IMAX only**. `mapRows` is
     shared, and evidence from one venue's feed is not evidence about the other's. Two bounded
     Southbank captures on 2026-09-10 hit Cloudflare (HTTP 403, "Just a moment...", no
     `searchResults`), so **Southbank keeps full strictness** until a capture succeeds.
  2. **Per-field** — `isUnambiguous24hClock()`, anchored and range-checked
     (`^([01]\d|2[0-3]):([0-5]\d)$`). The datetime parse still uses the original unanchored
     prefix regex `^(\d{1,2}):(\d{2})`, which also matches `"09:00 PM"` (really 21:00) and
     `"29:99"` — awarding provenance on that would trust the very AM/PM error the guard exists to
     catch. Parsing and mapper output cardinality are unchanged; the provenance changes which
     early mapped rows pass downstream validation.
- The display-text fallback deliberately sets **nothing** and keeps full strictness.
- **Do NOT change this to `"iso"`.** It is a local wall clock, not an instant, and `"iso"` would
  also lift BFI's `too_far_future` cap from 90 to 180 days — a horizon change nobody has evidence
  for. Regression tests in `bfi-time-provenance.test.ts` pin the 90-day cap for `local-24h`.
- Today's capture establishes the source **format**, a stable property of the feed. It does not
  establish the contents of any past run, so it cannot prove which 12 records were rejected then.

### Bertha DocHouse — stable booking URL (fixed 2026-07-20)
- Detail page `https://dochouse.org/event/<slug>/` lists each screening as
  `<a href="https://www.curzon.com/ticketing/seats/BLO1-XXXXXX">`. That Curzon href is a
  **transient seat-selection URL** (expires with the checkout session → 404), so it must NOT be
  persisted as `booking_url`. Keep `BLO1-XXXXXX` only as the `sourceId` (`bertha-{ticketId}`).
- **Booking URL = the event page itself**, read from its `<link rel="canonical">` / `og:url`
  meta (present on every event page). This keeps the fix inside BaseScraper's `string[] → string[]`
  page contract — no need to thread the fetched URL into `parseDetailPage`. Same trap the Curzon
  chain avoids by linking to the film page, not the `?sessionId` deep link.
- **Trailing strand labels in the showtime anchor (fixed 2026-08-09)** — anchor text is
  `"<Wkdy> <D><ord> <Mon> <HH>:<MM>"` and MAY carry a label after the time: `"Q&A"`, `"Intro"`,
  `"Summer Sessions"`. The old END-anchored regex `/(\d{1,2}:\d{2})\s*$/` skipped every labelled
  showtime — **34 of 122 anchors (17 of 62 unique) on 2026-08-09**, and because DocHouse labels
  nearly all of its far-future previews, that was the whole Sep 6 → Oct 21 tail. Now split on the
  FIRST `HH:MM` (`/^(.*?)(\d{1,2}:\d{2})(?!\d)/`): the date prefix never contains a colon-time,
  so match 1 is the date and anything after the time is a label we ignore.
  Replaying `scrape()` on the same 25 cached pages: **44 → 61 screenings, 26 → 34 distinct days,
  max 2026-09-22 → 2026-10-21**. Zero extra requests — the showtimes were already on pages we fetch.
- Horizon: 4 list pages (`/whats-on/`, `/whats-on/page/2..3/` yield URLs; page 4 returns 200 with 0
  new → natural stop) → 25 event pages → **~73 days** (2026-08-09 → 2026-10-21). That is the site's
  full published range at ~29 requests total, so `MAX_LIST_PAGES = 10` is not the binding constraint
  and no window widening is needed.
- **Watch for stale data, not just parse bugs**: on 2026-08-09 the DB held only 9 upcoming rows,
  every one `scraped_at = 2026-07-20` (the last `scraper_runs` row for this venue), and 7 of the 9
  were the very "Summer Sessions" screenings the regex can no longer parse — i.e. the labels were
  added to the site after 2026-07-20. When a venue's coverage looks truncated, check
  `MAX(scraped_at)` before blaming the parser: here both were true.
- Verify without writing: instantiate `BerthaDochouseScraper`, override `fetchUrl` to cache to disk,
  and call `scrape()` under `DATABASE_URL=disabled`. Note `parsePages` awaits
  `FestivalDetector.preload()`, which queries the DB — against the `max: 0` placeholder client that
  promise never settles and the process **exits silently with code 0** mid-scrape. Stub it in probes.

### Close-Up — WAF burst-403s (hardened 2026-07-13)
- The WAF intermittently 403s bursts of `/search_film_programmes/?date=` requests, then
  serves the same URLs fine minutes later. Scraper now retries each page (3 attempts,
  linear backoff) and only weeks 1–4 are load-bearing: far-future page failures shorten
  the horizon with a warning instead of failing the run (homepage embedded `var shows`
  JSON covers the current programme regardless).
- ~~`healthCheck()` overridden to reuse `fetchUrl`'s full browser headers — the BaseScraper
  UA-only GET gets 403'd even when the real scrape works (known false-negative class).~~
  **Override removed 2026-08-09** — base now sends identical headers, the precheck is advisory-only,
  and 403s here turned out to be real blocks. See the Close-Up section above.
- Horizon: `weeksToFetch = 10` → the last search page is ~70 days out, which is already the
  ~60–70-day target. The homepage `var shows` JSON plus L-CUT sampling both show the venue only
  publishes ~3 weeks ahead, so the extra pages return nothing new; they cost 6 requests, not data.
  Do not raise the window.

### INDY Systems platform (`src/scrapers/platforms/indy.ts`, 2026-07-14)
- **What**: INDY Cinema Group booking platform ("powered by Fandango"). Shared GraphQL
  client used by multiple London venues. Each venue proxies `/graphql` on its OWN domain.
- **Direct fetch, no browser**: the endpoint is OPEN — a plain `POST /graphql` with two
  identifying headers returns showings. No auth token / cookie / CSRF. This replaced the old
  Regent Street Playwright response-interception (which waited on fragile 20s/3s timers).
- **Required headers**: `circuit-id`, `site-id` (both mandatory — either alone → `{"error":
  {"message":"Site not found. (Code: 104)"}}`), plus `client-type: consumer` and
  `accept: application/graphql-response+json,application/json;q=0.9`.
- **Query**: `showingsForDate(date: "YYYY-MM-DD", siteIds: [<siteId>])` → `data[]` of
  `{ id, time (ISO UTC "…Z"), published, past, private, isPreview, screenId, movie{ id, name,
  urlSlug, duration, rating, releaseDate } }`. Loop dates today…+N (one POST per day). The
  response `{ data, count }` never paginates (verified: `count === data.length` on every date),
  so a single POST per date is complete.
- **Horizon** (`IndyVenue.horizonDays`, default `DEFAULT_HORIZON_DAYS`=35): per-venue, since
  the loop makes ONE POST per day so this is the exact request count. **Set it to exceed a
  venue's real publication window** — commercial INDY cinemas publish event cinema (opera,
  NT Live, repertory) months out. **Chiswick=150** (2026-07-20 audit: publishes to ~mid-Dec;
  the 35-day default captured only 16 of 66 distinct films, dropping the entire Sep+ tail incl.
  Fargo, Rear Window, Met Opera). Regent Street keeps the 35-day default. When adding an INDY
  venue, probe how far its `showingsForDate` returns data and set `horizonDays` accordingly.
- **Map**: filmTitle=`movie.name`; datetime=`new Date(time)` (`timeSource:"iso"` — true UTC,
  no BST mislabel); runtime=`movie.duration`; year=`movie.releaseDate` year;
  bookingUrl=`{baseUrl}/checkout/showing/{id}`; **sourceId=`{cinemaId}-{showing.id}`**.
  Keep only `published && !past && !private && !isPreview` future showings; dedupe by id.
- **Failure semantics**: `postShowingsForDate` retries (3×) then THROWS on HTTP/GraphQL/INDY
  error — never swallowed as empty success.
- **Known venues** (`circuit-id`/`site-id`): Regent Street 19/85, Chiswick 56/170. Discover a
  new venue's ids from the `circuit-id`/`site-id` headers on any `/graphql` request it makes.
- **NOT INDY**: Phoenix Cinema (East Finchley) is an ASP.NET `.dll` system
  (`PhoenixCinemaLondon.dll`), despite an old comment claiming otherwise — see cinemas/phoenix.ts.

### Phoenix Cinema (`cinemas/phoenix.ts`, updated 2026-08-09)
- **Platform**: ASP.NET/Savoy `.dll` (`PhoenixCinemaLondon.dll`), server-rendered — the full
  programme and all showtimes are in the initial HTML (no client-side rendering).
- **URLs**: `programmeUrl` = `/whats-on/` which now **301-redirects** to
  `/PhoenixCinemaLondon.dll/Home`. Playwright follows the redirect automatically; do not hard-code
  the `.dll/Home` URL. Film pages are `/PhoenixCinemaLondon.dll/WhatsOn?f={id}`.
- **CRITICAL — do NOT use `waitUntil: "networkidle"`** (root cause of the 2026-07-18 outage:
  every `page.goto` timed out at 60s → 3 retries exhausted → `success=false`, ~65 screenings went
  stale). The site holds analytics/tracking connections open so `networkidle` never fires. Use
  `waitUntil: "domcontentloaded"` — content is already present.
- **Programme selectors**: film links from `.film-title` → nearest `a[href*="WhatsOn"]`. The
  `/Home` page repeats each film (27 `.film-title` nodes for 16 films on 2026-08-09); dedupe by
  resolved `pageUrl`. There is no pagination — every currently-booking film is on that one page.
- **Showtime selectors — `li.performance` is ONE ROW PER DATE, NOT per screening.** This is the
  single easiest thing to get wrong here. Each `li.performance` (class token `performance`, which
  does NOT collide with `programme-performances` / `performances`, nor with the `day-has-performance`
  date-picker cells) holds exactly one `span.date.column` ("Sat 29 Aug") and then **N**
  `span.perf-time` → `a.button.booking` pairs inside a single `div.column`:

  ```html
  <li class="performance  columns is-multiline">
    <span class="date column is-12">Sat 29 Aug</span>
    <div class="column">
      <span class="perf-time">17:30</span>
      <a class="button booking" href="Booking?…TcsPerformance_604101…">…<span class="time">Book Now</span></a>
      <span class="perf-time">20:00</span>
      <a class="button booking" href="Booking?…TcsPerformance_604099…">…<span class="time">Book Now</span></a>
    </div>
  </li>
  ```

  Walk **every** `.perf-time` in the row and pair it with the *next anchor sibling* — that anchor
  is that showing's own booking deep-link. `querySelector('.perf-time')` (singular) silently kept
  only the first showing of each day: measured 2026-08-09 it returned **56 of the 66** future
  screenings the site published, losing every second-and-later showtime on a busy date (The Odyssey
  lost 6 of 12 — its whole 19:30 evening run — plus The Summer Book 1, Spider-Man 1, Bitter
  Christmas 2). Fixed 2026-08-09.
- **Times** are 24h with no AM/PM (`.perf-time` = "15:15"). Never read the booking button's inner
  `.time` span — it reads "Book Now". Anchors also carry
  `aria-label="Go to booking for 17:30"`, useful as a pairing cross-check.
- **Ground-truth trick**: each booking href carries `TcsPerformance_{id}`, one id per screening.
  Counting distinct ids across the film pages is a selector-independent count of what the site
  publishes — use it to verify completeness rather than trusting the row count.
- **`.performance` rows render TWICE** (desktop + mobile markup), so raw row counts are doubled;
  the scraper's `filmTitle+ISO` dedupe collapses them.
- **Horizon**: the site publishes only as far as booking is open — 2026-08-09 to 2026-09-03, i.e.
  ~25 days / 16 films / 66 screenings. That is the site ceiling, well short of the 60–70 day
  target; there is no window parameter that reveals more.
- **Date labels** use both "Sep" and "Sept" ("Tue 1 Sep", "Thu 03 Sept"); the month regex covers
  the 3-letter prefix so both parse.
- A positional date↔time fallback remains for layout drift (booking URL falls back to film page).
- **KNOWN ISSUE — all-or-nothing failure (`phoenix.ts`, "Failed to fetch N/M Phoenix film pages")**:
  the scraper visits 16 film pages and throws if *any one* of them fails, discarding all 66 already
  parsed screenings. One transient 30s timeout therefore costs the whole venue. Left as-is
  deliberately (partial batches used to drive superseded-cleanup deletions), but it is the likely
  scraper-side contributor to Phoenix's `status=failed` / zero-contributed-rows history alongside
  the 2026-08-05 DB-step retry bug. Revisit once the partial-batch `skipSupersededCleanup` guard
  lands: a threshold (e.g. fail only if >20% of pages fail) would be safer than all-or-nothing.
- **`fetchWithBrowser` (`utils/browser.ts`) still uses `waitUntil:"networkidle"`** and is a trap for
  this venue, but Phoenix does NOT use it — it launches `chromium` directly with
  `domcontentloaded`. The helper's only remaining caller is `debug-bfi.ts`. Do not route Phoenix
  (or any Savoy `.dll` venue) through it.
- **FUTURE (robustness)**: the `/Home` page embeds a Savoy modern-JSON `var Events = {…}` blob —
  Phoenix could migrate to `platforms/savoy.ts` (`extractSavoyEventsJson` + `parseSavoyEvents`,
  as used by Rio/Lexi/Arzner) and drop the 50+ per-film page navigations entirely.

### Savoy Systems platform (`src/scrapers/platforms/savoy.ts`, 2026-07-14)
- **Two DISTINCT front-end templates** — do not conflate them:
  - **Modern JSON** — homepage (root → `/{Dll}.dll/Home`) embeds `var Events = {"Events":[…]};`.
    Films carry `Performances[]` with `StartDate` ("YYYY-MM-DD") + `StartTime` ("HHMM", UK-local),
    `AuditoriumName`, `URL`, and (Lexi/Arzner) `TypeDescription`. Venues: **Rio, Lexi, The Arzner**.
  - **Legacy HTML-table** — `/{Dll}.dll/` renders server-side `div.programme` / `TcsProgramme_`
    title links / `td.PeformanceListDate` / `StartTimeAndStatus`, with **NO `var Events`**. Venues:
    **Ciné Lumière, ArtHouse Crouch End**. These need a SEPARATE table parser (not savoy.ts).
- **`platforms/savoy.ts`** handles ONLY the modern-JSON template: `extractSavoyEventsJson` (brace-
  matched blob extraction, THROWS if absent — never empty-as-success) + `parseSavoyEvents` (maps
  future performances, `combineDateAndTime` for UK-local HHMM, festival detection, optional
  `filmTypeOnly` filter). Per-venue variation via `SavoyVenue` builders (sourceId, booking URL).
- **Label corrections (verified live 2026-07-14):** Lexi is Savoy modern-JSON, NOT "Admit One";
  The Arzner is Savoy modern-JSON (`TheArzner.dll`), NOT "Jacro" — a direct scraper is trivial and
  is the intended replacement for its L-CUT gap-fill feed; Castle is Wagtail + Admit One, NOT Savoy.
- **`.dll` name per venue**: Rio→`Rio`, Lexi→`TheLexiCinema`, Arzner→`TheArzner`.

### Peckhamplex (`cinemas/peckhamplex.ts`, coming-soon added 2026-08-09)
- **Source URL patterns** — two listings, both unpaginated (verified: zero pagination links,
  complete set in one response). Declared in `LISTING_PAGES`:
  - `/films/out-now` — `required: true`. The current programming week ONLY.
  - `/films/coming-soon` — `required: false`. Dated event-cinema bookings 3-8 weeks out.
  - Film pages: `/film/{slug}`, absolute hrefs on the listings.
- **Why out-now alone gave ~4 days of coverage (the bug):** Peckhamplex turns its programme over
  weekly (Fri→Thu), so out-now publishes only to the coming Thursday — 1-7 days depending on which
  day you scrape. It is NOT a hardcoded window in our code, and it is not fixable: the venue does
  not publish regular-run showtimes further ahead. Measured 2026-08-09 (a Sunday): out-now covered
  08-09→08-13, i.e. 5 dates.
- **coming-soon is MIXED, and that is the whole point** — some entries are real dated screenings,
  some are pure release announcements:
  - On sale → has a `.book-tickets` section with `time[datetime]`, e.g. La Traviata on Sydney
    Harbour (2026-09-02 19:45), NT Live:The Misanthrope (09-22 19:30), Radiohead X Nosferatu
    (10-01 20:30), Our Land (10-05 18:30). These are legitimate screenings and are ingested.
  - Announcement only → **no `.book-tickets` element at all** (e.g. Never Had a Chance, Solo Mio,
    The Strangers - Chapter 3). The existing extraction is a `$(".book-tickets time[datetime]")`
    loop, so these yield zero screenings with no extra guard needed. Do **not** synthesise a
    screening from a release date — we store screenings, not release announcements.
  - Ratio on 2026-08-09: 4 of 7 coming-soon entries had showtimes. Result: horizon 08-13 → **10-05**
    (4 days → 57 days), 109 → 113 screenings, 5 → 9 distinct dates.
- **Horizon is site-limited, not window-limited.** 2026-10-05 is the furthest date the site
  publishes anywhere. There is nothing to gain from a wider window; do not add date-parameterised
  requests (no such endpoint exists — no date form/select on any listing).
- **Key selectors** (unchanged, reused for both listings — there is ONE parser):
  - Film URLs: `a[href*="/film/"]`
  - Showtimes: `.book-tickets time[datetime]`, attribute format `YYYY-MM-DDTHH:MM`, **UK-local**
    (converted via `ukLocalToUTC`, never the runtime TZ). Times live in
    `.date-wrapper > .btn-group > a.btn.btn-info > time`.
  - Title: `h1.page-title[itemprop="name"]` first, then fallbacks.
- **Dedup across listings:** `sourceId` is `peckhamplex-{titleSlug}-{ISO}` — derived from title +
  datetime, so it is byte-identical regardless of which listing led us to the film page. `scrape()`
  also unions film URLs through a `Set` before fetching, so a film on both listings costs one
  request, and `validate()` still dedupes on `sourceId` as a backstop. Verified: 0 duplicate
  sourceIds across the combined run.
- **Time provenance (verified 2026-09-10, regression-tested):** the `time[datetime]` attribute is
  London local with no zone designator, and on every captured showtime it agrees with the visible
  clock and with the button's analytics label (`'... : Thursday 10th September 2026 at 16:45'`).
  `parseDateTime` → `ukLocalToUTC` therefore stores 16:45 local as `15:45Z` in BST and `16:45Z` in
  GMT; `sourceId` embeds that UTC ISO. `cinemas/peckhamplex.test.ts` pins this through `scrape()`
  with fixtures reduced from a real capture (`__fixtures__/peckhamplex/PROVENANCE.json`) and a
  pinned clock. Rows shaped `2026-09-10T16:45:00Z` (the attribute read as UTC, rendering one hour
  late in BST) were found in production on 2026-09-08/09/10 with no `scraper_runs` entry, written
  around 06:06Z, alongside this scraper's correct rows. Their origin is **not established** and is
  out of scope for scraper work; do not "fix" the conversion to match them, and treat a
  same-film-same-date one-hour diff pair at this venue as a provenance question, not a rekey.
- **Known pitfalls:**
  - **Dead film pages 200 and render the listing.** Retired `/film/{slug}` URLs (e.g. the 6
    `tfff-*` festival slugs linked from `/the-final-film-festival`) return HTTP 200 but serve the
    out-now listing markup, so `extractFilmTitle`'s h1 fallback yields the literal title
    **"Films Out Now"**. Harmless today only because those pages carry no `.book-tickets` element
    and therefore emit zero rows. If you ever add a listing source that links retired slugs, guard
    the title against listing headings.
  - **`/the-final-film-festival` is not a usable source.** It links 6 film pages on neither
    listing, but all 6 are the dead pages above (0 showtimes). It is also a one-off promo route,
    not a stable listing pattern — deliberately not added to `LISTING_PAGES`.
  - Accessibility strands (`/films/autism-friendly`, `/films/hard-of-hearing`,
    `/films/watch-with-baby`) and `/site-map` surface no film URLs beyond the two listings — checked
    2026-08-09, nothing to gain.
  - Site-side titles can be dirty (`NT Live:The Misanthrope` is missing a space after the colon);
    leave that to downstream title cleanup, not the scraper.
  - out-now legitimately contains films with no showtimes yet (e.g. Spa Weekend) — logged as
    "no screenings found", not an error.
- **Required vs optional:** an out-now fetch failure throws (losing the whole near-term schedule
  must fail loudly rather than persist a partial batch — same rule as Close-Up's near-term pages);
  a coming-soon failure only warns and shortens the horizon for that run.
- **Verification without touching the DB:** instantiate `createPeckhamplexScraper()` and call
  `scrape()` under `DATABASE_URL=disabled` — it returns `RawScreening[]` and performs no writes.
- Last verified (live): 2026-08-09.

## 2026-09-08 audit integration: shared safeguards

- The screening pipeline resolves known cinema aliases and rejects unknown IDs before writes. Standalone Close-Up/Olympic IDs are canonical; metadata consolidation remains deferred.
- Superseded same-day proximity matches are **report-only**. The pipeline counts and retains candidates; no automatic deletion is available through this path. Existing `skipSupersededCleanup` still suppresses the diagnostic for partial batches. A clean write batch is not proof of complete source capture.
- Candidate counts are logged when nonzero and returned as `PipelineResult.supersededCandidates`. An unavailable report is `undefined`, not zero; reporting is best-effort and has a client-side 10-second ceiling. No row identities are captured by this count-only diagnostic.
- Validator hour/date policy uses Europe/London, not the host timezone. Bare 1–9-hour PM interpretation (including zero-padded inputs), early-time rejection, and 90/180-day horizons are unchanged pending source-aware design.
- Source excerpts live in `utils/fixtures/time-source-2026-09-08.json`. Ciné Lumière's captured `08:00` is marked Closed for Booking. PCC's captured times include AM/PM; Genesis uses 24-hour booking text; DocHouse's small sample contains afternoon/evening times. These are source observations, not evidence of stored production rows or universal historical formats.

---

## 2026-09-09 screening-loss accounting: counted units and stage boundaries

Every stage reports in one unit and every unknown is `"unavailable"`. An unmeasured
count is never written as zero. Types and conservation live in
`utils/screening-accounting.ts`; assembly across the runner seam lives in
`utils/screening-accounting-report.ts`.

**Where it is wired today: `runSingleVenue` only.** Single-venue scrapes log an
`[Accounting]` line and store the record under `scraper_runs.metadata.accounting`.
The chain per-venue path (Curzon, Picturehouse, Everyman) does **not** — it threads
`postWriteFailures` but builds no accounting, so those venues have no accounting line
and no stored record. Nothing prevents it; it is simply not wired yet. Per-venue
`parsed`, `preFiltered` and `fetchedPayloads` would be `"unavailable"` for a chain
anyway, since one `validate()` covers every venue in it.

**Counted unit.** One screening candidate — a single `RawScreening` as emitted by a
scraper. The same unit flows through every stage except fetch, whose unit is a payload.

**Stage boundaries.**

| Stage | Field | Source |
|---|---|---|
| fetch | `fetchedPayloads` | `BaseScraper.getFetchedPayloadCount()` |
| parse | `parsed` | `BaseScraper.getPreFilterReport().parsed` |
| pre-filter | `preFiltered`, `preFilteredByReason` | `BaseScraper.validate()` |
| validate | `validationRejected`, `validationRejectedByReason` | `validateScreenings` |
| accept | `accepted` | `PipelineResult.accepted` |
| write | `write.{upserted,updated,unchanged,failed}` | the pipeline write loop |
| post-write | `postWriteFailures` | `PipelineResult.postWriteFailures` |

**`fetchedPayloads` is not a request count.** It is the length of the `string[]` that
`fetchPages()` returns. A subclass hitting a bundled JSON API, or concatenating a
paginated fetch before returning, makes several HTTP calls per entry. HTTP request
volume is not measured anywhere.

**Pre-filter reason codes** (`PreFilterReason`, one per dropped candidate, evaluated
in this order): `missing_title`, `invalid_datetime`, `past_screening`,
`missing_booking_url`, `duplicate_source_id`, plus `subclass_filter`. The filter
predicates, their order and the surviving set are unchanged from before the
accounting; only the tally is new.

`subclass_filter` covers drops the base class cannot name. `validate()` is
overridable and three scrapers call `super.validate()` and then filter again —
`nickel-v2.ts` drops `MYSTERY MOVIE` titles, `genesis-v2.ts` and `lexi-v2.ts` repeat
the sourceId dedup (a no-op). `scrape()` reconciles the report against what
`validate()` actually returned and attributes any shortfall here, so a Nickel batch
of one mystery screening reports `accepted: 0` instead of claiming it kept a
candidate that never left the scraper. An override returning MORE than the base
filter kept cannot be described by the report at all, so it goes `"unavailable"`.
**If you add a `validate()` override that drops rows, you need no extra work** — the
reconciliation is automatic. Do not update the counts by hand.
A scraper implementing `CinemaScraper` without extending `BaseScraper` (for example
`cinemas/the-nickel.ts`) reports `parsed`, `preFiltered` and `fetchedPayloads` as
`"unavailable"`. Detection is duck-typed in `asPreFilterSource`.

**Write outcomes.** `upserted` means the `INSERT ... ON CONFLICT DO UPDATE` statement
ran; Postgres inserted or updated and the statement does not say which, so
`insertUpdateAttribution` is permanently `"unavailable"`. `updated` means an
`UPDATE ... WHERE id = ?` completed on a row `checkForDuplicate` had just identified.
`unchanged` means the duplicate check said skip, or a 23505 collision left the row
untouched.

`failed` means **"write outcome could not be established"**. It is a compatibility
counter, and two stronger readings are unsupported.

It does **not** prove no row persisted. `withDbTimeout` is a `Promise.race` and does
not cancel, so a statement abandoned at the 15s ceiling can commit afterwards; the
same note on `retryDeferredWrites` records that a late original insert makes the
retry hit the unique index and "fail" while the row is in the table. The legacy zero
counters on the runner's exception and cap paths carry the same caveat: zero there is
a compatibility value, not evidence that nothing was written.

It is also wider than a write failure. Three paths feed it — the write threw or was
dropped for a full deferred queue; `getOrCreateFilm` returned no id, so the whole
film group is charged without a write being attempted (a film-resolution loss, for
instance broken TMDB matching); or the film-level catch charged the batch remainder,
screenings abandoned before being attempted. So a venue whose title matching is
broken reports its loss here and can be misread as a persistence problem. Splitting
out `filmUnresolved` and `abandoned` is the honest fix and both are already distinct
code paths; it is a known follow-up.

**No write bucket proves a row reached the table.** Neither statement carries
`RETURNING` or reads a row count, so a row deleted concurrently between
`checkForDuplicate` and the `UPDATE` yields zero affected rows and still completes.
`affectedRowAttribution` is therefore permanently `"unavailable"` and the helper is
named `completedWrites`, not `persistedWrites`. Establishing the true count needs a
`RETURNING` on both production write statements.

**Conservation.** `checkAccounting` verifies each boundary and **skips rather than
fails** when an input is `"unavailable"` — an unknown count cannot disprove
conservation, and failing on it would push callers back to fabricating zeros.
`accepted` is measured at the write loop's input, independently of the buckets, so a
candidate that reaches no write outcome is reported instead of cancelling out. A
blocked batch is validated and then refused: it reports `accepted: 0`, no completed
or unchanged writes, and boundary 2 relaxes to "survivors cover the validation
rejections".

**Post-write failures are not lost writes.** A festival-link failure happens after
the row is committed, so it is counted on `postWriteFailures`, never in
`write.failed`. It is carried through `VenueResult.screeningsPostWriteFailures`,
`scraper_runs.metadata.postWriteFailures`, `scripts/lcut-gapfill.ts` and the runner
summaries, and it still refuses the superseded-candidate report via
`shouldRunSupersededCleanup`.

The only current producer is `festivals/eventive-scraper.ts`: it is the sole
place a `RawScreening` gets a `festivalSlug`, so today the counter is
structurally zero on every other path, including every registry venue scrape and
the L-CUT gap-fill. It is threaded through those paths anyway because the
contract is about the post-write stage, not about festivals specifically.

It reaches the **per-venue** layer only. `RunnerResult` has no run-level total, the
`runner_completed` log omits it, and `VenueResult.success` stays `true`, so
`tmp/scrape-run-summary.json` still shows a clean run. Read it from
`scraper_runs.metadata.postWriteFailures`, the `venue_completed` log, or the
per-venue `partial` status until a run-level rollup exists.

Known race: `withDbTimeout` is a `Promise.race` and does not cancel, so an abandoned
`insertScreening` keeps running and can report a post-write failure after the
pipeline has projected its counters (reported as zero) or just before the deferred
retry re-runs the write (which returns `unchanged`, excluded from `completedWrites`,
so the `postWriteFailures > completedWrites` check fires with no underlying error).
Closing either needs real cancellation.

**Deliberate behaviour change.** A festival-link failure used to propagate out of
`insertScreening` into the film-level catch, which counted that film's entire
remaining screening list as `failed` and abandoned it. `linkFestivalBestEffort` now
swallows and reports it, so the film's remaining screenings are written and counted.
For a venue with a failing festival link, `added` runs higher and `failed` lower than
before this change. The old numbers described writes that had in fact landed.

**Supplementary batches.** `supplementary: true` marks a deliberately partial batch
(L-CUT gap-fill and similar), whose counts must not be added into a full run's
totals. **It is a marker awaiting a consumer**: nothing sets it outside tests today
— `scripts/lcut-gapfill.ts` does not call `buildAccounting` at all — and nothing
enforces the exclusion. Treat it as documentation, not as a guarantee.

---
