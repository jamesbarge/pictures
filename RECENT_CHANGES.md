## 2026-06-01: SEO — dynamic sitemap.xml + robots Sitemap directive
**PR**: TBD | **Files**: `frontend/src/routes/sitemap.xml/+server.ts` (new), `frontend/static/robots.txt`
- **First sitemap the site has ever had.** New SvelteKit endpoint emits ~995 crawlable URLs: 13 static
  routes + 64 cinemas + 17 festivals + 701 people (`/people/[name]`, 60-day window — verified the people
  endpoint serves 200 across it) + films. Auth/user pages (sign-in, settings, watchlist) excluded.
- **Forward-compatible film coverage**: prefers a backend enumerator (`/api/films/sitemap`, not yet
  deployed → lands with the next backend promote to lift films from 200 → ~1,066) and gracefully falls
  back to the top-200 `browse` payload until then. A single failing upstream can't 500 the sitemap
  (every fetch degrades to an empty list).
- Host uses the **apex** `https://pictures.london` to match the app's canonical tags (`json-ld.ts`,
  `+layout.svelte`). Cached at the CDN (`s-maxage=86400` + SWR). Verified live: HTTP 200, well-formed
  XML, all five URL classes resolve to 200; svelte-check clean.
- **Follow-up flagged**: the site serves on `www` but declares canonical `apex` and redirects apex→www
  (a circular signal). Recommend a `www→apex` 308 in Vercel domain config so canonical = served host.

## 2026-06-01: BFI scraper hardening — canonical sourceId + retry dead-code + parser tests
**PR**: TBD (#640) | **Files**: `src/scrapers/bfi-pdf/bfi-source-id.ts` (new), `src/scrapers/bfi-pdf/bfi-source-id.test.ts` (new), `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/bfi-parse.ts` (new), `src/scrapers/cinemas/bfi-parse.test.ts` (new), `src/scrapers/bfi-pdf/pdf-parser.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`, `scripts/dedup-bfi-sourceid-migration.ts` (new)
- **(Task 6) Retry dead-code + parser tests**: `RETRY_BACKOFF_MS[2]` (60s) was never read (`[attempt-1]` indexes −1/0/1) yet the array length set the attempt count — decoupled into `MAX_SEARCH_ATTEMPTS=3` + `[10s,30s]` so the dead value is gone without dropping a retry. Extracted `parseSearchResultsArray` + `SearchRow` into a pure `cinemas/bfi-parse.ts` and added 7 unit tests (nested arrays, bracket-in-string, escaped quotes, malformed→null). `mapRows`/0-indexed-month test deferred (needs a pure-extraction refactor of the instance-coupled mapper).
- **Bug:** the three BFI ingest paths each built a different sourceId (`bfi-…`/articleId vs `bfi-pdf-…` vs `bfi-changes-…`), so a path flip (Playwright → PDF fallback) produced a different id for the same screening → the `(cinema_id, source_id)` upsert INSERTed a duplicate instead of updating. Same-time NFT1/NFT2 shows could also collapse.
- **Fix:** shared `buildBfiSourceId(cinemaId, title, screen, datetime)` → `bfi-<cinemaId>-<titleSlug>-<screen>-<iso>`, used by all three paths. `screen` normalised to a canonical token (NFT1–4/STUDIO/IMAX/REUBEN) so "Southbank - NFT3" (Playwright) and "NFT3" (PDF) key identically; the screen segment also disambiguates simultaneous NFT1/NFT2 shows. Dropped the articleId variant + dead `extractArticleId`; PDF path now keys on per-screening venue→cinemaId (not the file-level pdfLabel).
- Verified: cross-path equality + NFT disambiguation (unit test + tsx check); `tsc` clean. Dedup dry-run vs prod: 0 current dupes.
- **Deploy sequence (one-time churn):** reformatting changes every BFI sourceId, so the next scrape inserts new-keyed rows alongside the old. After deploy → BFI scrape → run `scripts/dedup-bfi-sourceid-migration.ts --execute` (safe: only removes dupes within a (cinema,film,datetime,screen) partition; preserves legit multi-screen shows). PR held for review — not auto-merged.

## 2026-06-01: JW3 cinema scraper — last uncovered London rep/indie venue (Spektrix)
**PR**: TBD | **Files**: `src/scrapers/cinemas/jw3.ts` (new), `src/config/cinema-registry.ts`, `src/scrapers/registry.ts`, `src/scrapers/cli.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`
- Adds **JW3** (341-351 Finchley Road) — the last London rep/indie venue with no coverage. Fetch-based (no browser): 2 calls to the Spektrix v3 read API (client `jw3`) — `GET /events` filtered to `attribute_Genre == "Cinema"` (excludes the centre's talks/languages/classes), `GET /instances?startFrom&startTo` joined by `event.id`.
- `startUtc` is already UTC (append `Z`), so the BST off-by-one that bit the HTML scrapers cannot occur. Booking via verified `…/spektrix/ChooseSeats?EventInstanceId=…`. Poster from `event.imageUrl`; availability from `isOnSale`.
- Verified dry-run vs live API: **109 Cinema events → 81 screenings / 25 films**, Jun 2 → Aug 16, 0 past, all with booking URLs. tsc clean. Registered in cinema-registry + scraper registry + CLI; playbook documented.

## 2026-05-31: Search — people search + /people/[name] director & actor pages
**PR**: TBD | **Files**: `src/app/api/films/search/route.ts`, `src/app/api/people/[name]/route.ts` (new), `frontend/src/lib/search/result-types.ts`, `frontend/src/lib/components/search/rows/PersonRow.svelte` (new), `frontend/src/lib/components/search/ResultsList.svelte`, `frontend/src/lib/stores/palette.svelte.ts`, `frontend/src/lib/seo/json-ld.ts`, `frontend/src/routes/people/[name]/+page.{server.ts,svelte}` (new), `frontend/src/routes/directors/+page.svelte`, `scripts/verify-people-search.ts` (new)
- **New discovery axis: search by person.** The command palette now has a **PEOPLE** group — typing a director's name (e.g. "scorsese") surfaces them with their upcoming-film count; Enter → a new `/people/[name]` page. Trigram-matched so typos still hit ("scorses" → Scorsese).
- **`/people/[name]` pages** (ISR + Person JSON-LD): a director/actor's upcoming London showings as a poster grid, sectioned **As Director** / **On Screen**, each film linking to its detail page. Indexable long-tail SEO ("[director] films showing London").
- Backend: `/api/films/search` gains a `people[]` group (directors via `unnest`, mirrors `/api/directors`); new `GET /api/people/[name]` matches director (`= ANY(directors)`) OR cast (`cast @> [{name}]`) joined to upcoming screenings. `/directors` list entries now link to the pages.
- Verified vs prod DB: "Scorsese" → Martin Scorsese (10 films); typo tolerance; person page returns role-flagged films. v1 search group is directors-only (actor-in-results deferred to avoid hot-path jsonb-unnest cost); person pages show both roles.

## 2026-05-31: Search — remove 30-day coverage cap + exact-match relevance boost
**PR**: #638 | **Files**: `src/app/api/films/search/route.ts`, `scripts/verify-search-coverage.ts`
- **Coverage fix**: the films search dropped its hard `ns.next_dt < now() + 30 days` upper bound. Verified against prod: **256 of 1,082 upcoming films (24%) had their earliest screening >30 days out and were unsearchable** — repertory titles, retrospectives announced early, festival films. They are now findable; the recency boost keeps soon-showing films at the top.
- **Relevance**: added an exact-title boost (`0.20`, dominates the ~0.03 RRF ceiling so e.g. "amelie" → Amélie #1) and a prefix-title boost (`0.08`). Verified: `D.E.B.S.`, `Possession`, `Ghatak Was Here` now return rank #1 for an exact query (all returned 0 results before).
- The `screenings` result sub-query keeps its near-term window (intentional: a film is findable forever-out and links to its detail page, which lists every screening; individual booking rows stay near-term). No response-contract change; code-reviewed clean.

## 2026-05-31: Consolidate 30 CI-green refactor/perf PRs (#606–#636) into one batch
**PR**: #637 | **Files**: 60 files across `frontend/src/{routes,lib}/…` (per-PR detail in #606–#636)
- Merged all **30** file-disjoint refactor/perf branches (`rf/*`, created 2026-05-30) into a single integration branch so they ship in one CI cycle instead of 30 sequential "branch up-to-date" rebases (O(n²) → O(n)).
- All 30 merged cleanly against current `origin/main` — **zero conflicts, zero skips, zero reverts**. None of the refactors' intents were obsoleted by newer main.
- Content: delete unused exports/imports + dead code, hoist `Intl` formatters / constants / weekday arrays out of hot paths, dedupe rating formatting, simplify a `typeof` guard, trim SSR payload fields (cinema-slug / reachable / search / home / festival-slug), and per-frame `getBoundingClientRect` fix in BreathingGrid.
- Behavior-preserving. Verified: `npm run check` → 0 errors (2 pre-existing unrelated warnings), `npm run build` → success. Supersedes individual PRs #606–#636 (excl. already-merged #619).

---

## 2026-05-30: Scraper coverage + freshness pass — end of June 2026
**PR**: TBD | **Files**: `src/scrapers/pipeline.ts`, `src/scrapers/chains/everyman.ts`, `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/olympic.ts`, `src/scrapers/cinemas/david-lean.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`
- **42P10 upsert keystone**: `(cinema_id, source_id)` upsert lacked `targetWhere source_id IS NOT NULL` for its partial index → Postgres silently dropped every fresh INSERT across all source_id scrapers (Everyman/Curzon/Picturehouse), freezing forward coverage. Re-applied the lost 2026-05-27 fix.
- **BFI fixed with stealth Playwright, no paid proxy**: single wide date-range search per venue (`page_size=2000` → 1 navigation/venue) reading the inline AudienceView `searchResults` array. bfi-southbank → Jul 31, bfi-imax 2 → 94 → Jul 19. PDF importer kept as fallback.
- **Everyman window 30→45 days** (end-of-month no longer clipped → chain reaches Jul 12); **olympic** canonical-id fix (dup cinema); **david-lean** year-rollover fix (phantom 2027 dates).
- Data: full/targeted re-scrapes (no data loss), 8-pass enrichment (poster −54, TMDB −17, synopsis −17, runtime −36), orphan cinema cleanup (nickel/olympic). 0 suspicious times remain.
- Coverage: chains + most independents now ≥ Jun 30; a handful (Peckhamplex, Electric, Barbican, ICA, etc.) sit below only because those venues haven't published end-of-June dates yet (venue-publication limit, confirmed by zero-add re-scrapes).

## 2026-05-30: Frontend performance campaign — 20 PRs shipped (−388 KB fonts + more)
**PRs**: #581, #585–#603 | **Files**: `frontend/src/app.html`, `frontend/src/app.css`, `frontend/vite.config.ts`, `frontend/static/fonts/`, multiple `frontend/src/{routes,lib}/…`, per-PR detail in `changelogs/2026-05-30-*.md`
- **Fonts −388 KB (−42%)**: deleted never-requested `InterVariable-Italic.woff2`; repointed the misdirected 352 KB Inter preload → 38 KB Cormorant-Italic (the face actually painted above the fold).
- **4 routes prerendered** (`/about`, `/privacy`, `/terms`, `/seasons`) → static edge assets (TTFB); `manualChunks` vendor split (bits-ui).
- **Images**: `width`/`height`/`fetchpriority`/`decoding`/`loading`/`srcset` across FilmCard, FilmSimilarRail, letterboxd, palette rows (CLS + LCP + ~90% lighter palette posters).
- **INP/runtime**: hoisted per-row/per-call `Intl.DateTimeFormat`; memoized filter cluster-membership + radius passes; `requestIdleCallback`-gated PostHog/web-vitals init.
- **SSR payloads** trimmed on `/cinemas` + `/directors`; removed ~2,400 lines of dead components (orphaned FilterBar/SearchInput tree + 4 standalone unused).
- All behavior-preserving, CI-gated, and live-smoke-checked after each merge (200/200, zero regressions). Open for review: #582/#583 (lazy-mount), #604 (font cache header). Full audit: `Obsidian/Pictures/Audits/2026-05-30-frontend-perf-campaign.md`.

---

## 2026-05-30: P0 — rate limiter fails open (prod outage fix)
**PR**: TBD | **Files**: `src/lib/rate-limit.ts`, `changelogs/2026-05-30-rate-limit-fail-open.md` (new)
- Production was fully down (every API route + SSR returning 500 / `FUNCTION_INVOCATION_FAILED`). Root cause: Upstash Redis hit its 500k-request quota; `checkRateLimit()` (the first call in every route) threw the `max requests limit exceeded` error instead of failing open, 500'ing all DB-backed endpoints before the query even ran.
- Fix: `checkRateLimit` now catches backing-store errors and falls back to the existing in-memory limiter — a rate limiter can no longer take down the whole API.
- Also corrected during triage: prod `DATABASE_URL` env var had a trailing literal `\n` (corrupted db name `postgres\n`, `3D000`) — a latent bug that would have broken queries once past the limiter.

---

## 2026-05-26: BST timezone fix — bfi.ts, rich-mix.ts, rich-mix-v2.ts off by +1h
**PR**: TBD | **Files**: `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/rich-mix.ts`, `src/scrapers/cinemas/rich-mix-v2.ts`, `src/scrapers/cinemas/bst-regression.test.ts` (new), `scripts/verify-bst-fix.ts` (new), `scripts/diagnose-bst-bug.ts` (new)
- Customer-reported bug: site displayed showtimes 1 hour ahead of reality during BST. Three scrapers were using `new Date(y, m, d, h, mi)` (local-TZ constructor); on the UTC server this stored BST clock-face times as UTC, and the frontend's UTC→Europe/London render added +1h on top. Verified end-to-end against Rich Mix's Spektrix API.
- Fix: route all three through `ukLocalToUTC()` — the project's existing BST-safe helper that Curzon/Picturehouse/Everyman already use.
- Data backfill: 5 BFI duplicates deleted (rows where a correct PDF-source twin existed at -1h) + 210 BFI rows shifted -1h + 79 Rich Mix rows shifted -1h. 294 rows total. Scoped strictly by `source_id` prefix; bfi-pdf and bfi-changes data left untouched.
- Regression test added at `src/scrapers/cinemas/bst-regression.test.ts` (vitest worker hangs in this checkout — pre-existing infra issue, not from this change; manual verify via `TZ=UTC npx tsx scripts/verify-bst-fix.ts` passes 7/7).

---

## 2026-05-20: cmd+k step 10 — E2E spec + production alias promotion + step-9 deferred
**PR**: TBD | **Files**: `frontend/tests/command-palette.spec.ts` (new), `changelogs/2026-05-19-cmdk-step9-deferred.md` (new)
- Step 10: 5-case Playwright spec locks in the cmd+k contract — ⌘K opens / Esc closes, fuzzy query renders Amélie via trigram, Enter on a film row navigates to `/film/[id]`, composite filter-action surfaces for multi-slice queries, Enter on it mutates the calendar (`70mm` + `Horror` pressed in sidebar). All 5 pass cleanly in 15.3s on chromium.
- `openPalette()` helper auto-retries up to 3 times around a bits-ui Dialog mount race in headless: the first synthetic keydown can land before the document-level listener wires up. Worth it — eliminates flakes entirely.
- Production alias promoted: `api.pictures.london` was pinned to a 23-day-old deployment (April 26). `vercel promote` pointed it at the latest production build (step 7), unblocking the new RRF API for the live frontend. Confirmed: pictures.london ⌘K now returns 8 Amélie screenings + film row from a trigram-fuzzy "amelei" query.
- Step 9 (client Orama index) DEFERRED to v2. Server-only p95 ≈100ms already feels snappy; the ~50ms cold→warm gain isn't worth ~88KB bundle + Web Worker + IDB + brotli-wasm build complexity. Documented in `changelogs/2026-05-19-cmdk-step9-deferred.md` with reopen conditions.

---

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

## 2026-05-19: data-check.ts — 5 new dirty-title + scraper-health detectors
**PR**: #568 | **Files**: `scripts/data-check.ts`
- Adds 5 new issue types to the patrol's `crossReferenceDb` pass: `dirty_title_html_entity` (score 50), `dirty_title_event_prefix` (40), `dirty_title_all_caps` (35), `dirty_title_format_suffix` (35), `suspicious_orphan_film` (22).
- Adds 1 global cycle-start detector: `cinema_screening_drop` (score 65) — flags cinemas whose 14-day upcoming count is <50% of 14-day rolling average (degraded scrapers).
- All six surface issues the patrol's existing auto-fix loop can act on (decode entities, smart-title-case, strip prefix, reclassify event, investigate scraper). Pre-existing rows previously missed by the at-scrape `cleanFilmTitle` pipeline now surface within one patrol cycle.

---

## 2026-05-19: scripts/patrol-autofix.ts — closes detect→fix loop
**PR**: #569 | **Files**: `scripts/patrol-autofix.ts` (new), `scripts/patrol-autofix.test.ts` (new), `vitest.config.ts`
- Auto-applies fixes for the 5 new dirty-title issue types data-check surfaces (PR #568): decode HTML entities, smart-title-case ALL CAPS (acronym-preserving), strip event prefixes + format suffixes via existing `cleanFilmTitleWithMetadata`, reclassify orphans matching learned non-film patterns.
- Idempotent (second run produces 0 changes), cron-safe, with collision guards, recent-match (matched_at < 24h) guards, TMDB-ID protection, and `--dry-run` / `--only=` selectors.
- 11 vitest cases pin the pure helpers (`decodeHtmlEntities`, `smartTitleCase`, `shouldFlagAllCaps`). `vitest.config.ts` extended to include `scripts/**/*.test.ts` so script-level tests run in `npm run test:run`.
- First live run: 3 ALL CAPS fixed, 6 non-films reclassified. Second run: 0 changes.

---

## 2026-05-19: film-title-cleaner — regex non-film entries (parity with data-check)
**PR**: #570 | **Files**: `src/scrapers/utils/film-title-cleaner.ts`, `src/scrapers/utils/film-title-cleaner.test.ts`
- Extends `getKnownNonFilmType` to support `{ regex: true, pattern: "<re>" }` entries in `knownNonFilmTitles`. Previously only exact-match worked, even though data-check's `buildNonFilmMatchers` already accepted both shapes — closing the gap so scraper-time classification matches patrol-time detection.
- New exported helper `getKnownNonFilmTypeFromEntries(title, entries)` is the pure matching function (testable without the learnings file); `getKnownNonFilmType` is now a thin wrapper that loads + delegates.
- 8 new vitest cases pin: empty entries, exact-match insensitivity, regex patterns, default `"event"` fallback, custom `live_broadcast` types, exact-wins-over-regex ordering, malformed-regex silent skip, and entries lacking both title and pattern.

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
