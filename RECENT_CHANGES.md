## 2026-05-18: gitignore Finder-duplicate pattern (root cause fix)
**PR**: TBD | **Files**: `.gitignore`
- Adds `* [2-9].{ts,tsx,d.ts,mts,cjs,mjs,svelte,js,jsx,json,css,md,example}` patterns so macOS Finder duplicates (`vite.config 2.ts`, `+page 2.svelte`, `ecosystem.config 2.cjs`, etc.) can never be staged or committed again.
- The root tsconfig.json already excludes `**/* 2.*`, `**/* 3.*`, `**/* 4.*` defensively because these duplicates have leaked into commits four separate times. This PR removes the recurrence at source so future PRs can collapse the tsconfig bandages.
- Verified the new patterns match Finder-style paths at any depth (`frontend/src/lib/utils 2.ts`, `src/lib/data-quality/index 2.ts`) and do NOT false-match legitimate files (`foo2.ts`, `config.json`).

---

## 2026-05-17: Add Curzon Camden + Richmond + Wimbledon to cinema-registry (consistency)
**PR**: TBD | **Files**: `src/config/cinema-registry.ts`
- Adds the 3 reactivated Curzon venues (from #513) to the canonical cinema-registry so they match the chain scraper config. Without this, the DB seed pipeline wouldn't know about them and the frontend's `CinemaDefinition` map would have gaps.
- Coordinates, addresses, screen counts, and chain metadata pulled from Curzon's public venue pages. All marked `active: true` consistent with their chain-config state.
- Pure data addition. No code changes; 993 tests still pass.

---

## 2026-05-17: Reactivate Curzon Camden + Richmond + Wimbledon (also fix Wimbledon siteId typo)
**PR**: TBD | **Files**: `src/scrapers/chains/curzon.ts`, `src/scrapers/pipeline.ts`
- All 3 Curzon venues previously marked `active: false` are actually **live and programming**. The "no listings since Feb 2026" comment was wrong — verified via live API probe with Bearer-prefixed JWT:
  - **Curzon Camden** (CAM1): 25 future-dated screenings
  - **Curzon Richmond** (RIC1): 15 future-dated screenings
  - **Curzon Wimbledon**: live programming — but the recorded `chainVenueId` `WIM01` was a TYPO. Correct site code is **WIM1** (HTTP 400 vs HTTP 200 — confirmed against the live API). Fixed.
- Active cinema count: **60 → 63**.
- Bonus: `ensureCinemaExists` in `pipeline.ts` now re-asserts `isActive: true` on existing-cinema UPDATE path (was only setting it on INSERT). Background: the 3 Curzon DB rows have lingering `is_active=false` from a prior code state; the chain config and DB flag had fallen out of sync. The new behaviour treats the chain config as source-of-truth for cinema activeness, since that's where scrapers are actually controlled.
- 993/993 tests pass; type-clean.

---

## 2026-05-17: Flaky detector — small-venue exclusion
**PR**: TBD | **Files**: `src/lib/scrape-quarantine.ts`, `src/lib/scrape-quarantine.test.ts`
- New `smallVenueMaxNonEmptyMean: 5` threshold in `FlakyThresholds`. When a cinema's mean screening-count across non-empty successful runs is ≤ threshold, the empty-success-ratio signal is suppressed (failed-ratio still fires normally).
- Background: a cinema whose non-empty runs are themselves near-zero isn't "alternating between healthy and broken" — it's just a small venue. The previous detector would flag it forever as flaky because its natural rhythm includes legitimate zero-yield scrape windows.
- Behavior-preserving for genuinely-flaky cinemas: those with non-empty mean > 5 (e.g. BFI Southbank with 250+ in healthy runs) still fire normally. Confirmed via production replay: BFI IMAX with non-empty mean 7.75 (outlier 25-count run) still flagged; a hypothetical IMAX-pure-small-venue (mean 2) would now be suppressed.
- 3 new unit tests covering the small-venue case + 2 still-fires regression cases. 993/993 tests pass; type-clean.

---

## 2026-05-17: Parallelize DQS verifier loop by cinema (preserves per-host rate-limit)
**PR**: TBD | **Files**: `scripts/data-check.ts`
- `verifyCinemaScreenings()` previously ran one verifier at a time with a 500ms sleep between EACH call regardless of cinema — wasteful since each verifier hits a different host. Now groups screenings by `cinema_id` and runs one sequential worker PER cinema, with the 500ms rate-limit preserved within each cinema's worker. With ~6 distinct cinemas in the queue this collapses wall-clock from ~10s to ~2s, freeing up the 3-min phase budget for extra coverage or retries.
- Adds a `perCinemaCap = ceil(CINEMA_VERIFICATION_CAP / cinemaCount)` to stop a single busy host crowding out coverage of the others. Final result capped at the original `CINEMA_VERIFICATION_CAP` so the overall budget is unchanged.
- Behaviour-preserving for the rate-limit contract: each cinema host still sees one request per 500ms; nothing parallelizes within a single host.
- 990/990 tests pass; type-clean.

---

## 2026-05-17: Extract iCal parser to src/scrapers/utils/ical-parser.ts
**PR**: TBD | **Files**: `src/scrapers/utils/ical-parser.ts` (new), `src/scrapers/cinemas/cinema-museum.ts`
- Moves `parseVEvents` + supporting types from `cinemas/cinema-museum.ts` to `utils/ical-parser.ts`. Re-exported from the original location so the existing test file's import continues to work. No behaviour change.
- Code-review follow-up flagged in #496's review: "Consider extracting the `parseVEvents` parser to `src/scrapers/utils/` if another iCal-feed venue surfaces in future audits." Pre-extracting now so the next iCal-feed venue (e.g. Bertha DocHouse's WordPress Events Calendar, or any other Pressidium-hosted London cinema) drops in with a single import.
- 990/990 tests pass; type-clean; no test changes required.

---

## 2026-05-17: /scrape post-run — delta-vs-baseline report (per-run yield UX surfacer)
**PR**: TBD | **Files**: `src/lib/scrape-quarantine.ts`, `src/lib/scrape-quarantine.test.ts`, `src/scripts/run-scrape-and-enrich.ts`
- New `detectYieldDeltaSinceBaseline(options?)` + `formatYieldDeltaReport(deltas)` in `src/lib/scrape-quarantine.ts`. Compares the most recent successful run per cinema to the mean of all successful runs from the prior 7 days (excluding the latest). Flags cinemas whose current count is ≤ 70% of baseline AND whose baseline mean is ≥ 10 (to filter small-cinema noise). Complements the existing yield-drop detector — yield-drop needs a 25-run window to fire; this fires after a single below-baseline run.
- Wired into `/scrape` as a new post-run phase (Phase 5). Single windowed SQL, ~400ms.
- 2 new formatter tests. SQL function integration-verified against production: surfaces 3 Everyman venues with current run yield 30-35% below 7-day baseline.
- 990/990 tests pass.

---

## 2026-05-17: Add Everyman Brentford + Whiteley to chain config
**PR**: TBD | **Files**: `src/scrapers/chains/everyman.ts`, `src/config/cinema-registry.ts`
- Adds two newly-opened Everyman venues identified in the 2026-05-15 London coverage audit research: **Everyman Brentford** (TW8 8GR, theater ID `G049A`, 3 screens) and **Everyman at The Whiteley** (W2 4YN, theater ID `G05D7`, 5 screens, Bayswater).
- Live API probe against `everymancinema.com/api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=<ID>` returned HTTP 200 with screenings data for both. The existing Everyman chain scraper fans out via `THEATER_IDS` map — no new scraper code needed.
- Active cinema count: 58 → 60.

---

## 2026-05-17: /scrape detection — tests for analyzeRunsForSilentBreaker
**PR**: TBD | **Files**: `src/lib/scrape-quarantine.test.ts`
- Adds 6 unit tests for the pure `analyzeRunsForSilentBreaker` analyzer that landed unannotated via the #506 merge. Covers: below-threshold null, default-threshold fire + lastGood semantics, "stops at last good", failed-status doesn't fire silent-breaker (that's flaky's job), ASC/DESC input parity, custom threshold. 988/988 tests pass.

---

## 2026-05-15: /scrape detection — yield-drop detector (closes third detection gap)
**PR**: TBD | **Files**: `src/lib/scrape-quarantine.ts`, `src/lib/scrape-quarantine.test.ts`, `src/scripts/run-scrape-and-enrich.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`, `.claude/commands/scrape.md`, `src/scrapers/chains/curzon.ts`
- New `detectYieldDrop` + `analyzeYieldDrop` + `formatYieldDropReport`. Compares recent avg `screening_count` (last 5 successful runs) against a trailing baseline (next 20). Flags when `recentAvg / baselineAvg ≤ 0.5` (warn) or `≤ 0.3` (critical). Closes the third detection gap (silent breakers + flaky catch `success+0` / `failed`; yield-drop catches `success+low-but-non-zero` — e.g. PDF parser silently dropping one venue from a multi-venue scrape).
- Single windowed SQL (ROW_NUMBER OVER PARTITION), filters to `status='success'` so failed/empty rows don't pollute the math. Live replay against production: 0 false positives in 461ms.
- 10 new unit tests covering: window-size gate, healthy ratio, critical, warn, baseline-floor, BFI-style 200→30 regression, ASC input ordering, custom thresholds, formatter output.
- Wired into both pre-flight and post-run health phases of `/scrape`.
- Bonus: updated `curzon-camden`/`curzon-richmond`/`curzon-wimbledon` venue comments to note 2026-05-15 web search shows live public listings — left `active: false` pending verification with a prod-side JWT probe (API still 401s locally without Cloudflare bypass).

---

## 2026-05-17: /goal conditions #8 & #9 — flaky detector + BST sentinel (Phase 1 of scraper-perfection plan)
**PR**: TBD | **Files**: `src/lib/scrape-quarantine.ts`, `src/lib/scrape-quarantine.test.ts` (new), `src/scripts/run-scrape-and-enrich.ts`, `scripts/goal-check-flaky-cinemas.ts` (new), `scripts/goal-check-bst-sentinel.ts` (new), `scripts/goal-status.ts`, `tasks/goal.md`, `changelogs/2026-05-17-goal-ws-a-flaky-and-bst.md`
- Phase 1 of the "make scrapers perfect" plan (WS-A: measurement substrate). Two new end conditions added to `tasks/goal.md`, taking the goal from 7 conditions to 9.
- **Condition #8 — No flaky-critical cinemas**: resurrected `detectFlakyCinemas` (a ratio-based detector that catches alternating-failure cinemas like BFI IMAX in May 2026 — 14/21 success+0 runs but never two consecutive, so the silent-breaker detector missed it). New unit test covers 9 fixture scenarios including the BFI IMAX ground truth, Close-Up failed-runs pattern, threshold-bumping logic, and lastGoodRunAt accuracy. Wired into `/scrape` pre-flight so flakies are surfaced before a 30-60min run wastes time on broken cinemas.
- **Condition #9 — Zero BST-pattern screenings**: standing guardrail for the recurring BST off-by-one bug class that has bitten Curzon, Everyman, and Picturehouse in the last 4 weeks. Queries the 02:00-09:59 UK-local window for upcoming screenings. The 00:00-01:59 zone is deliberately excluded because Everyman, PCC, and Genesis legitimately programme midnight cult screenings (Mulholland Drive, Obsession, Hokum at Everyman Broadgate were flagged during smoke-testing — false positives the wider window would have produced).
- Smoke run confirms both conditions PASS on current data — 2 cinemas at warn-level flakiness (BFI IMAX, Close-Up) but 0 critical; 0 BST offenders in the tightened 02:00+ window.

---

## 2026-05-17: DQS verifier repair — Barbican selector, Rio fallback, Picturehouse API
**PR**: TBD | **Files**: `scripts/data-check.ts`, `tasks/goal.md`, `changelogs/2026-05-17-dqs-verifier-repair.md`
- Diagnostic probe (now deleted) ran each `cinemaVerifications` verifier against one current production screening per cinema. Three verifiers were broken in different ways:
  - **Barbican** — selector `a[href*="/whats-on/"]` was matching site-wide nav menu items (`"Cinema"`, `"Theatre & dance"`) instead of film cards. Switched to body-text contains-prefix search (the Genesis/Rich Mix pattern that already works). Probed `"The Devil Wears Prada 2"` against the Barbican listing — body contains the title, body-text fallback matches.
  - **Rio** — the `var Events = {...}` regex no longer matches the embedded JSON. Verifier was returning `fetch_error` on every call, which excluded Rio from the denominator but added zero confirmed. Added a body-text fallback so the page-fetched-but-JSON-missing case still produces a `confirmed` when the title is present.
  - **Picturehouse** — `https://www.picturehouses.com/cinema/<slug>` URL 301-redirects to the homepage, so the verifier was scanning the homepage for film titles. Switched to the same POST API the existing scraper uses (`/api/scheduled-movies-ajax` with `cinema_id` form field, mapped via `PICTUREHOUSE_VENUES.chainVenueId`). Smoke-tested against Clapham — API returned 200 with 24 movie titles.
- ICA, Genesis, Rich Mix were already healthy. Curzon + Everyman correctly return `fetch_error` when their fetches fail (Cloudflare / wrong URL) — excluded from denominator, not dragging the rate.
- After the next two `/data-check` runs, condition #7 should transition from `deferred-passing` back to genuinely-passing on the recorded `compositeScore` (the verification signal should rise above the 0.1 threshold).

---

## 2026-05-16: /goal condition #7 — defer when verification signal is structurally zero
**PR**: TBD | **Files**: `scripts/goal-check-dqs.ts`, `tasks/goal.md`, `changelogs/2026-05-16-goal-condition-7-dqs-verification-deferral.md`
- Full `/goal status` (no `--fast`) ran today and revealed condition #7 (DQS floor ≥ 85) failing at 76.62/77.42. Drilling into the composite: every dimension above 85 except `verificationPassRate` at 0. Verification is computed from `cinemaVerifications` (static HTML verifiers for Rio, ICA, Barbican, Close-Up, Genesis, Rich Mix in `scripts/data-check.ts`) — they're all returning non-`confirmed` status, likely from cinema booking-page schema drift.
- `goal-check-dqs.ts` now mirrors the condition #6 deferral pattern: when verification is structurally broken (≤ 0.1 for two consecutive runs), the composite is recomputed excluding the 15% verification weight (remaining weights proportionally rescaled). If the adjusted composite clears 85 on both runs, the condition is `pass: true, deferred: true`. The `anyDeferred` rollup gate (shipped in PR #502) prevents the goal from being falsely declared achieved while #7 is deferred. The fix for the underlying verifiers is queued as a sub-task in `tasks/goal.md`.
- Adjusted composites for the current state: latest 90.15, previous 91.1 — both well above the 85 floor. Confirms the non-verification dimensions are healthy.

---

## 2026-05-15: /goal condition #6 — defer below 500-event traffic floor
**PR**: TBD | **Files**: `scripts/goal-check-posthog-funnel.ts`, `scripts/goal-status.ts`, `tasks/goal.md`, `changelogs/2026-05-15-goal-condition-6-traffic-floor.md`
- Empirical probe found pictures.london emits 52 `booking_link_clicked` events / 30d across 56 active cinemas, all properly tagged with `cinema_id`. The "31 zero-click cinemas" surfaced in the first /goal run is a traffic-distribution artefact, not a tracking bug or product defect.
- Condition #6 now defers when total monthly clicks < 500 (returns `pass: true, deferred: true`). Above the floor, the existing per-cinema check engages. This stops /goal from endlessly targeting an impossible-at-this-traffic condition while the goal file pins the upgrade path (Stagehand-based booking-URL verifier as a sub-task).
- Orchestrator status table now shows `ℹ️ — deferred` instead of `✅` for deferred conditions so users don't misread the rollup as proof the underlying thing works. The headline verdict ("🎯 ALL CONDITIONS PASS — goal is ACHIEVED") is now gated on `!anyDeferred` so the goal can't be falsely declared achieved while a condition is in deferred state.
- Regression guard: persists prior `totalClicks` to `.claude/goal-posthog-funnel-last.json`. If the current window's total drops below 50% of a prior baseline that was above the floor, the condition fails loudly with a "volume regression" reason rather than silently flipping to deferred-pass. Catches analytics breakage (PostHog key rotated, frontend tracker removed, ad-blocker surge) instead of masking it.

---

## 2026-05-15: Add Cinema Museum scraper via iCal feed
**PR**: TBD | **Files**: `src/scrapers/cinemas/cinema-museum.ts`, `src/scrapers/cinemas/cinema-museum.test.ts`, `src/scrapers/registry.ts`, `src/config/cinema-registry.ts`
- New scraper for **The Cinema Museum** (Kennington, SE11) — independent venue in the former Lambeth workhouse, programmes 35mm + silent + Kennington Bioscope evenings. Priority 2 in the 2026-05-15 London coverage audit. Active cinema count 57 → 58.
- Uses the WordPress Events Calendar plugin's public **iCal feed** (`/schedule/?ical=1`) rather than HTML scraping — single request, structured data (DTSTART, SUMMARY, URL, UID, CATEGORIES), no DOM parsing.
- Minimal in-tree iCal parser (`parseVEvents`) — RFC 5545 line folding + TEXT escapes (`\,`, `\;`, `\\`, `\n`). No new npm dependency.
- Filters out `Tours` and `Bazaars` categories (museum tours, bric-a-brac sales) — keeps film screenings, talks, Kennington Bioscope, and the 35mm classics series.
- **WAF workaround**: cinemamuseum.org.uk's Pressidium host returns 403 for browser-like User-Agents on the iCal endpoint but allows generic calendar-client UAs. The scraper overrides both `fetchPages` and `healthCheck` with a `pictures-cinema-museum-scraper/1.0` UA. Documented inline.
- 11 unit tests (3 parser, 8 scraper) against a 3-event iCal fixture covering filtering, BST→UTC conversion, UID prefixing, URL preservation, escape unescape, line folding, empty feed.
- Live verification: 23 valid screenings in ~725 ms; programme through May/June 2026.

---

## 2026-05-15: Add Bertha DocHouse scraper — first new London independent
**PR**: TBD | **Files**: `src/scrapers/cinemas/bertha-dochouse.ts`, `src/scrapers/cinemas/bertha-dochouse.test.ts`, `src/scrapers/registry.ts`, `src/config/cinema-registry.ts`
- New Cheerio-based scraper for **Bertha DocHouse** (dochouse.org) — the UK's only year-round documentary cinema, inside Curzon Bloomsbury but programmed independently. Identified as Priority 1 in the 2026-05-15 London coverage audit.
- 2-step list-then-detail pattern: `/whats-on/` paginates events; each `/event/<slug>/` carries screening times + Curzon `BLO1-XXXXXX` ticket IDs (used as `sourceId`).
- 9 unit tests covering title, time parsing, sourceId derivation, non-Bertha ticket filtering, defensive empty handling, and the today-edge-case where `parseScreeningDate` would otherwise +1 year a same-day screening.
- Live verification: returns 43 valid screenings across 21 events in ~20 s; covers the programme through early June.

---

## 2026-05-15: /goal command — terminal goal-driven loop with measurable end conditions
**PR**: TBD | **Files**: `tasks/goal.md`, `scripts/goal-check-{coverage,silent-breakers,booking-links,lighthouse,axe,posthog-funnel,dqs}.ts`, `scripts/goal-status.ts`, `changelogs/2026-05-15-goal-command.md`
- New `/goal` slash command (local in `.claude/commands/`): unlike `/kaizen` and `/posthog-optimize` (perpetual), this one declares an explicit finish line and exits when crossed. Reads `tasks/goal.md`, runs all measurement scripts, picks the highest-leverage failing condition, fixes one sub-task per invocation, holds merge behind the existing `ship it` deployment gate.
- Goal: "Pictures.london v1 — complete, fast, accessible, trustworthy". Seven end conditions: London independents covered, no silent breakers, zero broken booking links, Lighthouse mobile ≥90, axe-core clean, PostHog `booking_click` proof-of-life per cinema, DQS floor ≥85 across two consecutive `/data-check` runs.
- Orchestrator (`scripts/goal-status.ts`) runs every check, prints status table, writes `.claude/goal-status.json` for the slash command to read. `--fast` skips lighthouse + axe for inner-loop iteration.
- No new dependencies — lighthouse and axe-core invoked via `npx` on demand per CLAUDE.md dep-rule.

---

## 2026-05-15: /scrape follow-ups — is_repertory at write time + stale-cinema is_active filter
**PR**: TBD | **Files**: `src/scripts/cleanup-upcoming-films.ts`, `src/lib/scrape-quarantine.ts`
- Closes the cycle-N+1 patrol dependency for `is_repertory`: the TMDB-match UPDATE path in `cleanup-upcoming-films.ts` now sets `isRepertory: isRepertoryFilm(release_date)` alongside `year`. The patrol caught 5 misflagged films in 5 consecutive cycles before this; now repertory films are tagged at write time using the same helper `film-matching.ts` already uses.
- `detectStaleCinemas` now filters `WHERE c.is_active = true`, excluding 5 zombie cinemas (curzon-camden / curzon-richmond / curzon-wimbledon / everyman-walthamstow / nickel) that would otherwise appear as "never scraped" in every `/scrape` post-run report indefinitely.

---

## 2026-05-15: Push recurring data-check fixes into /scrape (prefix/suffix sync + foreign-bracket + write guards + stale surfacing)
**PR**: TBD | **Files**: `src/scrapers/utils/film-title-cleaner.ts`, `src/scrapers/utils/film-write-guards.ts` (new), `src/scrapers/pipeline.ts`, `src/scrapers/utils/film-matching.ts`, `src/scripts/cleanup-upcoming-films.ts`, `src/lib/scrape-quarantine.ts`, `src/scripts/run-scrape-and-enrich.ts`, plus tests
- **Patrol-learned prefixes/suffixes feed the scraper**: `film-title-cleaner` now loads `.claude/data-check-learnings.json` at module init and appends `prefixesToStrip` (79) + `suffixesToStrip` (25) to its existing hand-curated lists. Gracefully degrades to empty arrays when the file isn't present (CI / fresh checkouts). Same patterns the patrol fixes after-the-fact now apply at scrape time.
- **Foreign-title-bracket normalizer**: new `extractEnglishFromBracket` detects `Original (English)` titles (Garden Cinema, Cine Lumière, BFI repertory) and routes the LOOKUP through the English form for TMDB matching while keeping the original on the films row for display. Wired into `pipeline.ts::getOrCreateFilm`.
- **Write-site guards** (`film-write-guards.ts`): `sanitizeYear` rejects `0` / `Number("") = 0` / pre-1900 / future-noise values. `sanitizeDirectors` refuses arrays containing `% Starring %` and warns. Applied at `film-matching.ts:212` (TMDB-matched insert) and `cleanup-upcoming-films.ts:257` (enrichment update).
- **Known non-film titles**: new `getKnownNonFilmType` / `isKnownNonFilmTitle` helpers expose `learnings.json::knownNonFilmTitles` (34 entries) for callers to set content_type before film resolution (full wiring deferred to follow-up).
- **/scrape report observability**: post-run summary now lists cinemas with no scrape in the last 24h + recent patrol DQS stats (count, avg, min) from learnings.json. Both read-only, fail open if the file isn't present.

---

## 2026-05-15: Dedup screenings + prevent recurrence in /scrape (BST shifts, film-id flips, BFI cluster bug)
**PR**: TBD | **Files**: `src/scrapers/utils/screening-classification.ts`, `src/scrapers/pipeline.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`, `src/db/migrations/0011_screenings_cinema_source_unique.sql`, plus cleanup scripts + tests
- Removed **1,065 bogus screening rows** in three classes:
  - **710 (cinema_id, source_id) duplicates** in upcoming screenings — same source resolved to different films (e.g. Hard Boiled @ The Nickel, 135 same-datetime) OR BST off-by-one regressions producing datetime+1h dupes (e.g. Wake in Fright @ The Gate, Shrek @ Everyman Maida Vale — 409 of these). For same-datetime: latest scrape wins. For BST-shift: earlier datetime always wins (the +1h variant is always the bug).
  - **254 (cinema_id, source_id) duplicates** across past dates (so the unique-index migration could be applied).
  - **351 BFI Southbank "many films at same datetime" rows** — the programme-changes-parser's `getFollowingText` was grabbing the full parent paragraph's text, so 6+ films sharing one `<p>` each got matched against every sibling's screening times.
- **Pipeline prevention**: `processScreenings` now uses `(cinema_id, source_id)` as conflict target when sourceId is set, so a re-scrape with a corrected datetime UPDATEs the existing row in place. `checkForDuplicate` Layer 0 dropped the datetime filter to match.
- **DB enforcement**: new partial unique index `idx_screenings_cinema_source ON screenings (cinema_id, source_id) WHERE source_id IS NOT NULL` makes the invariant non-negotiable.
- **BFI parser fix**: `getFollowingText` now walks DOM siblings and stops at the next `<b>`/`<strong>`, with a fallback that slices parent text correctly when only text nodes follow. Regression test added in `programme-changes-parser.test.ts`.

---

## 2026-05-14: Multi-day rolling calendar — always show upcoming films
**PR**: TBD | **Files**: `frontend/src/lib/calendar-filter.ts`, `frontend/src/routes/+page.svelte`, `frontend/src/lib/components/calendar/DayMasthead.svelte`, `frontend/test-all.spec.ts`, `frontend/tests/mobile.spec.ts`
- Homepage no longer goes blank late at night when today's screenings are all past. The default view now shows a rolling window: today + as many upcoming days as needed to fill at least ~24 films (capped at 7 days).
- Each day is its own `<section>` with a day header ("Today · Thursday, the fourteenth", "Tomorrow · Friday, the fifteenth", or just "Saturday, the sixteenth" for later days). Films within each day stay sorted by Letterboxd rating (the existing `compareFilmsByCalendarPriority` ordering), but the sort **resets per day**.
- `buildFilmMap` default range changed from `[today, today]` to `[today, ∞)`. The DayMasthead day-strip buttons now anchor the window from the clicked day onwards (one-sided range) instead of collapsing to a single day. Date-picker / filter-sidebar single-day presets still set both ends.
- Desktop's old `hybridFilms` flat-grid is replaced with day-grouped sections. Mobile's global `.mobile-date-label` is replaced with per-section headers.

---

<!-- Older entries archived to /changelogs/. Per CLAUDE.md: keep only ~20 most recent. -->
