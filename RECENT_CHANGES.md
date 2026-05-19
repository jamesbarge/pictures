## 2026-05-19: cmd+k step 8 — intent-to-actions + filters.applyIntent
**PR**: TBD | **Files**: `frontend/src/lib/search/intent-to-actions.ts` (new), `frontend/src/lib/search/intent-to-actions.test.ts` (new), `frontend/src/lib/stores/filters.svelte.ts`, `frontend/src/lib/stores/palette.svelte.ts`
- Step 8: the palette can now mutate the calendar. Typing "horror 70mm tonight" surfaces a "JUMP TO" composite action row; pressing Enter (or Alt+Enter, or clicking) applies all parsed slices to the filters store and closes the palette. The calendar narrows behind the (intentionally non-blurred) backdrop — the 5-second magic.
- `intentToActions(parsed)` returns at most ONE composite filter-action row. Adding more keywords narrows the same row rather than multiplying choices — matches user mental model better than per-slice rows. 9 Vitest cases cover empty intent, single slice, multi-slice composition, stable id keyed on slice values, decade rendering, and a "cinema tokens deferred" guard so we don't silently surface no-op actions.
- `filters.applyIntent(parsed)` is a batch mutator covering formats, genres, decades, dates (DST-aware via `Intl.DateTimeFormat` round-trip), times, and the `repertory` programming type. Existing filter state for other slices survives so users can build filters across multiple queries.
- Cinemas/chains are deliberately deferred: the parser yields slug tokens like "pcc" that would need UUID resolution. Cleaner solution shipping today: Alt+Enter on a CinemaResult row sets `filters.cinemaIds = [cinema.id]` directly.
- Added `filters.snapshotForUndo()` + `filters.restoreFromSnapshot()` so step 10 can hang an Undo toast off them without re-architecting.
- Palette `mergedResults` injects synthesised actions into `PaletteResults.actions`, so the flat selectedIndex walks across them correctly and `selectedRow` returns the right thing for Enter activation.
- 59/59 Vitest, svelte-check 0 errors, build 9.86s. Verified live: typing → chips render, Enter → format=70mm pressed + genre=horror pressed + "Show 0" in calendar sidebar.

---

## 2026-05-19: cmd+k step 7 — server-fetch wiring + row activation
**PR**: #577 | **Files**: `frontend/src/lib/stores/palette.svelte.ts`, `frontend/src/lib/components/search/CommandPalette.svelte`
- Step 7 of the cmd+k plan: the palette is now wired to the server. Each keystroke debounces 80ms, aborts any in-flight request via AbortController, calls `/api/films/search?q=…`, and maps the response into the `PaletteResults` shape ResultsList renders.
- Adds the `kind` discriminator the server omits in the mapping function so row components stay type-safe. The legacy field name `results` (= films) is preserved in the response and renamed locally.
- Activation modes: Enter (default — close palette, navigate via `goto`), Cmd/Ctrl+Enter (new tab — palette stays open), Alt+Enter (filter — falls through to open for entities until step 8 wires real `filters.applyIntent`). Click-on-row equivalents: plain click, Cmd/Ctrl-click, Alt-click. Screenings always open their bookingUrl externally regardless of mode (external destination).
- Listbox click delegation walks up from `e.target` to find the row's `[role="option"]` button, parses its `cmdk-opt-N` id, and looks up the row in `palette.flatRows[N]`. Avoids modifying all 8 row components for a single click handler.
- Mouse hover drives `selectedIndex` so keyboard Enter operates on the row the cursor highlights.
- Stale responses are dropped silently: after `await apiGet(...)`, if `query` has moved on we ignore the response. AbortError from DOMException or generic Error is treated as cancellation, not failure.
- `closePalette()` now clears query + results + serverError + isLoading state, so re-opening doesn't briefly show stale data from the last session.
- Vitest 50/50 green; svelte-check 0 errors / 0 new warnings; production build 3.12s.

---

## 2026-05-19: cmd+k step 6 — ResultsList + 8 row variants + flat arrow nav
**PR**: #576 | **Files**: `frontend/src/lib/components/search/ResultsList.svelte` (new), `frontend/src/lib/components/search/rows/*.svelte` (8 new), `frontend/src/lib/search/result-types.ts` (new), `frontend/src/lib/components/search/CommandPalette.svelte`, `frontend/src/lib/stores/palette.svelte.ts`
- Step 6: the palette renders real result rows once data lands. 8 row variants matching the property catalog (film, cinema, screening, festival, season, filter-action, recent, user-status).
- `result-types.ts` exposes a discriminated `ResultRow` union, `PaletteResults` sectioned shape, `SECTION_ORDER` and `SECTION_LABELS` for header rendering, and `flattenResults()` so arrow nav walks a flat array indexed by `selectedIndex`.
- Listbox structure follows the inline SearchInput pattern: flat `<div role="listbox">` with direct `<button role="option">` children. Section headers are `<div role="presentation">` between groups — avoids invalid `<li>` nesting + `<div onclick>` a11y warnings.
- 49 + 1 Vitest cases pass; svelte-check clean; E2E green.

---

## 2026-05-19: cmd+k step 5 — visible modal shell (bits-ui Dialog)
**PR**: #575 | **Files**: `frontend/src/lib/components/search/CommandPalette.svelte` (new), `frontend/src/lib/components/search/CommandPaletteInput.svelte` (new), `frontend/src/lib/components/search/ActiveFiltersRow.svelte` (new), `frontend/src/lib/components/search/Chip.svelte` (new), `frontend/src/routes/+layout.svelte`, `frontend/package.json` (+ bits-ui)
- Step 5: pressing ⌘K renders a real modal (desktop) or full-screen sheet (mobile). bits-ui Dialog handles focus trap, scroll lock, portal mount.
- Modal at top: 12vh, 640px wide; max-height: min(560px, calc(100vh - 24vh)). Backdrop is FLAT 0.45 opacity, NOT blurred — intentional for the step 8 live-filter-mutation feature where the user sees the calendar change behind the palette.
- ActiveFiltersRow renders chips BELOW the input (NOT inside) — chosen for a11y + ARIA 1.2 compliance. Chips reflect `palette.parsed.chipDescriptors`.
- Result region is still a placeholder until step 6 lands the real ResultsList.

---

## 2026-05-19: cmd+k step 4 — palette + media stores + global cmd+k binding
**PR**: TBD | **Files**: `frontend/src/lib/stores/palette.svelte.ts` (new), `frontend/src/lib/stores/media.svelte.ts` (new), `frontend/src/lib/components/search/GlobalCmdkBinding.svelte` (new), `frontend/src/routes/+layout.svelte`, `frontend/src/lib/stores/palette.test.ts` (new)
- Step 4: the runes-based store + global keyboard binding for cmd+k. The store owns `open`, `query`, derived `parsed = parseQuery(query, new Date(nowTick))`, `selectedIndex`, `triggerSource`. Imperative state (AbortController, debounce timer) stays as plain module variables — making them `$state` would create effect loops on identity changes.
- `nowTick` ticks every 60s so date phrases like "tonight" stay accurate during long idle sessions without re-parsing on every keystroke for no reason.
- `media.svelte.ts` wraps `matchMedia('(min-width: 768px)')` — palette UI reads `media.isDesktop` in step 5 to pick modal-vs-sheet variant. SSR-safe default true so server markup matches first-paint for the majority case.
- `GlobalCmdkBinding.svelte` mounts in `+layout.svelte` next to PostHogProvider / SyncProvider. It listens for ⌘K/Ctrl+K globally but yields when the existing inline `SearchInput` combobox already has focus (avoid stealing keystrokes from an active search). When the palette UI lands in step 5, this binding becomes the entry point; for now it toggles `palette.open` with no visible side-effect — useful for verifying the binding wiring before committing to UI shell.
- 50/50 Vitest cases pass (49 parser + 1 store sanity).

---

## 2026-05-19: cmd+k step 3 — Pure query parser + 49 Vitest fixtures
**PR**: TBD | **Files**: `frontend/src/lib/search/parse-query.ts` (new, 610 LOC), `frontend/src/lib/search/parse-query.test.ts` (new, 49 cases), `frontend/src/lib/search/vocab/*.ts` (8 dictionaries), `frontend/vitest.config.ts` (new), `frontend/package.json` (+ vitest)
- Step 3 of the cmd+k plan: pure, dependency-free query parser tokenises `"horror tonight at curzon"` etc. into a structured `ParsedIntent` for the upcoming palette UI to feed back into `filters.applyIntent()`.
- Vocab dictionaries: formats, genres, decades, countries, languages, chains + cinema aliases (PCC, ICA, BFI), certifications (U/PG/12/12A/15/18), specials (rep, subs, relaxed, premiere, watchlist, nearby), time presets + literals.
- Multi-word phrase scan runs before single-token lookups: "this weekend", "next saturday", "70mm imax", "uk premiere", "want to see", "prince charles".
- Date math is London-tz aware via `Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London'})` — matches the existing `filters.setDatePreset` pattern. `now` is injected (not read from `Date.now()`) so Vitest snapshots are deterministic.
- Added `vitest` (4.1.6) as frontend devDep — first unit-test runner in `frontend/` (Playwright remains for E2E). `npm test` runs the suite.
- 49 cases cover: empty/whitespace, plain freeText, all 10 date phrases, time presets + literals + after/before, all format aliases, sci-fi genre mappings, decades + countries + language priority, cinema chains + slug aliases, all special flags, composite queries ("subtitled french noir 80s"), chip ordering, dedup.

---

## 2026-05-19: cmd+k step 2 — RRF API + title-only search_text (typo tolerance)
**PR**: #572 | **Files**: `src/app/api/films/search/route.ts`, `src/db/migrations/0013_search_text_title_only.sql` (new)
- Step 2 of the cmd+k plan: replaces ILIKE with Reciprocal Rank Fusion (k=60) over `search_tsv` + `search_text` from migration 0012. Adds recency boost (1-week decay on next upcoming screening) + popularity boost (`0.02·ln(1+tmdb_popularity)`).
- Fans out 5 parallel queries via `Promise.all` so the new global palette gets films + cinemas + screenings + festivals + seasons in one round-trip. Response shape preserves `{ results, cinemas }` for the existing inline SearchInput and extends with `screenings`, `festivals`, `seasons`.
- Migration 0013 trims `search_text` to **title-only** (cinemas: name-only). Migration 0012 included `title + original_title + directors` which bloated the string and dropped trigram similarity for typos like "amelei" vs "Amélie" from 0.4 to 0.07 (below the 0.3 `%` threshold). Title-only restores fuzzy match. `original_title` and `directors` are still searched lexically via tsvector A/B weights.
- Verified end-to-end against production data: `amelei` returns Amélie (2001); `akira` returns Akira (1988) first; `wes anderson` returns Wes Anderson's films (Fantastic Mr. Fox, Grand Budapest, Royal Tenenbaums) via director B-weight; `curzon` returns 6 cinemas + 8 screenings + 0 films (correct — no films named curzon).
- Latency: ~400ms in dev mode (Next.js cold + dev overhead). Production cold expected ~80ms; warm ~25ms per the DB-agent budget.

---

## 2026-05-19: cmd+k search foundation — DB migration (FTS + pg_trgm) + a11y mark fix
**PR**: TBD | **Files**: `src/db/migrations/0012_search_layer.sql` (new), `scripts/verify-search-migration.ts` (new), `src/db/schema/films.ts`, `src/db/schema/cinemas.ts`, `src/db/schema/screenings.ts`, `src/db/schema/festivals.ts`, `src/db/schema/seasons.ts`, `frontend/src/lib/components/filters/SearchInput.svelte`, `tasks/cmdk-palette-plan.md` (new), `changelogs/2026-05-19-cmdk-search-foundation.md` (new)
- Step 1 of the 10-step cmd+k palette plan: enables `unaccent`, `pg_trgm`, `btree_gin`; creates the `pictures` text search config; adds weighted `search_tsv` (A/B/C/D) + `search_text` generated STORED columns on films + cinemas, plus `search_tsv` on screenings, festivals, seasons; 7 GIN indexes + 4 compound btree indexes; partial `idx_screenings_film_future` for the RRF recency boost.
- Adds `scripts/verify-search-migration.ts` (14 checks: extensions present, config exists, columns generated, indexes built, unaccent works "Amélie"→"amelie", trigram works "amelei"→"amelie", cast jsonb extraction populated). Migration is **not yet applied** to Supabase — pending explicit ship approval.
- Fixes WCAG 1.4.1 violation in `SearchInput.svelte` `<mark>` styling: bold-alone wasn't a redundant differentiator for users who can't perceive weight; adds `text-decoration: underline` + offset. Affects every existing search highlight, not just the new palette.
- Schema files explicitly do NOT declare the generated columns (Drizzle 0.45's generated-column type exclusion leaks them into FilmInsert and breaks 2 callsites in `src/scrapers/utils/film-matching.ts`). Migration SQL is source of truth; search columns are queried via raw `sql\`...\`` in step 2.
- Migration uses `ARRAY(SELECT jsonb_array_elements_text(jsonb_path_query_array(cast, '$[*].name')))` to extract cast names for the films tsvector B-weight — the only IMMUTABLE-safe pattern that PG ≤16 accepts in a generated column expression.

---

## 2026-05-18: Catch-up batch — RECENT_CHANGES entries for session test-coverage PRs
**PR**: TBD | **Files**: `RECENT_CHANGES.md`
- Adds canonical RECENT_CHANGES entries for the 6 test-coverage PRs (#521, #523, #524, #525, #526, #528) shipped earlier in the session that deliberately omitted the top-of-file entry to avoid the rebase-conflict cascade caused by multiple open PRs editing line 1.
- Also corrects the `**PR**: TBD` on the "the the" typo entry to `**PR**: #519`.
- Trims older entries to maintain the CLAUDE.md "~20 most recent" guidance.

---

## 2026-05-18: Add unit tests for src/lib/title-patterns.ts (38 cases) (#528)
**PR**: #528 | **Files**: `src/lib/title-patterns.test.ts` (new)
- 38 vitest cases covering all 3 exported functions: `isLikelyCleanTitle`, `cleanBasicCruft`, `decodeHtmlEntities`.
- Pins the canonical title-cleanup regex layer used by both AI and regex-based extractors. Key contracts: short-prefix-before-colon heuristic + FRANCHISE allowlist; suffix strip families (Q&A, Director's Cut, Anniversary, BBFC rating); the "only 5 entities decoded" decoder contract (`&nbsp;` and `&eacute;` NOT decoded).

---

## 2026-05-18: Add unit tests for src/lib/title-extraction/search-variants.ts (#526)
**PR**: #526 | **Files**: `src/lib/title-extraction/search-variants.test.ts` (new)
- 14 vitest cases for `generateSearchVariations` (TMDB title-matching variant generator).
- Pins two surprising contracts: year-strip is **end-anchored**, and transforms do NOT chain (`"Vertigo (1958)..."` does not produce `"Vertigo"`).

---

## 2026-05-18: Add unit tests for src/lib/geo-utils.ts (#525)
**PR**: #525 | **Files**: `src/lib/geo-utils.test.ts` (new)
- 13 vitest cases for `isCinemaInArea` and `getCinemasInArea` (the map-area filter on the cinema map).
- Pins the polygon **auto-close convention** — callers supply N vertices, the implementation auto-appends the first. A future "refactor" requiring closed polygons from callers would now fail this test.

---

## 2026-05-18: Add unit tests for src/lib/external-urls.ts (#524)
**PR**: #524 | **Files**: `src/lib/external-urls.test.ts` (new)
- 18 vitest cases covering `getTmdbUrl`, `getImdbUrl`, and the non-trivial `generateLetterboxdUrl`.
- Pins all 5 apostrophe-variant strips (`'`, `'`, `‘`, `´`, `` ` ``) — a single stray edit to the regex chain would silently 404 thousands of Letterboxd film links.

---

## 2026-05-18: Add unit tests for src/lib/admin-emails.ts (security-critical) (#523)
**PR**: #523 | **Files**: `src/lib/admin-emails.test.ts` (new)
- 18 vitest cases covering `getAdminEmailAllowlist` and `isAdminEmail`.
- The most load-bearing test is **"substrings do NOT match"** — pins `Array.includes(email)` semantics against the easy-to-introduce bug of swapping to `String.includes` (`admin@example.com` must NOT match `secretadmin@example.com`).
- Also covers env-var override semantics: env replaces default entirely (default admin REJECTED when env is set).

---

## 2026-05-18: Add unit tests for src/lib/levenshtein.ts (#521)
**PR**: #521 | **Files**: `src/lib/levenshtein.test.ts` (new)
- 17 vitest cases for both `levenshteinDistance` and `levenshteinSimilarity`.
- Load-bearing for TMDB matching (`src/lib/tmdb/match.ts`), season linking, and fallback enrichment confidence — a regression silently degrades film-matching quality across the enrichment + scraping stack.
- Pins UTF-16 surrogate-pair behaviour (🎬 counts as 2 code units) and the `maxLen=0` short-circuit in similarity.

---

## 2026-05-18: Fix "the the" typo in data-quality warning message (#519)
**PR**: #519 | **Files**: `src/lib/data-quality/index.ts`
- Single-character comment-only fix in the learnings-file-not-found warning. No code logic affected.
- Surfaced while reviewing the file for the gitignore-Finder-duplicates PR; the canonical `index.ts` had a leftover duplicated "the" from the earlier Trigger.dev → cloud-orchestrator rename.

---

## 2026-05-18: Add unit tests for src/scrapers/utils/url.ts (#522)
**PR**: #522 | **Files**: `src/scrapers/utils/url.test.ts` (new)
- Adds 17 vitest cases covering `normalizeUrl` (all 3 branches: absolute http/https, root-relative, bare path) and `slugify` (lowercase, hyphenation, character stripping, hyphen preservation, underscore preservation, multi-space collapse, 50-char truncation, empty input, all-stripped input, all-whitespace input).
- No behaviour change. Pins the current contract — including two non-obvious behaviours: (a) the absolute-URL check uses `startsWith("http")` so any `httpd-cache/x` string is treated as absolute, and (b) accented characters like `é` are stripped because JavaScript's `\w` is ASCII-only.
- Both functions are used across many scrapers (URL normalization in run-* scripts; `slugify` for `sourceId` stable-ID generation). A regression silently corrupts identifiers in screening rows.

---

## 2026-05-18: Remove stale `scripts/check-screen-green.ts` from tsconfig exclude (#520)
**PR**: #520 | **Files**: `tsconfig.json`
- Removes the per-file exclude `"scripts/check-screen-green.ts"` from `tsconfig.json`. The file does not exist (and has no git history — it was never committed). The exclude was added defensively but never had a corresponding file to protect.
- Verified: `git log -- scripts/check-screen-green.ts` returns zero commits, and the file is absent from the working tree.
- Single-line removal. No behavioural impact (excluding a non-existent file is a no-op).

---

## 2026-05-18: gitignore Finder-duplicate pattern (root cause fix) (#518)
**PR**: #518 | **Files**: `.gitignore`
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


<!-- Older entries archived to /changelogs/. Per CLAUDE.md: keep only ~20 most recent. -->
