## 2026-11-05: Scrape v2 — tiered fetch, indies-first runner, Claude Code review
**PR**: #861 | **Files**: `src/scrapers/fetch/tiered-fetch.ts`, `src/scrapers/base.ts`, `src/scrapers/utils/browser.ts`, `src/scrapers/cinemas/bfi.ts`, `src/lib/jobs/scrape-all.ts`, `src/scripts/run-scrape-and-enrich.ts`, `src/lib/scrape-horizon.ts`, `scripts/enrichment-gaps.ts`, `.claude/commands/scrape.md`, `.gitignore`
- Blocked pages escalate from a direct fetch to Firecrawl (GB proxy), and BFI to a Browserbase browser. Both tiers fail soft without keys and are budget-capped. Usage is recorded in `scraper_runs.metadata.fetchTiers`.
- Independents (8 at once) and chains (3) run as parallel pools, so independents never wait behind chains.
- `/scrape` adds a horizon check (≥30 days), poster and rematch passes, and a Claude Code review of `tmp/enrichment-gaps.json`. Approved decisions persist in `data/enrichment/manual-decisions.json` and are re-applied every run.
- `/scrape`, the rules and the TMDB blocklist are versioned again. A fresh clone had lost them because `.claude/` was gitignored.

---
## 2026-10-25: Remove the homepage STARTING SOON strip
**PR**: #845 | **Files**: `frontend/src/routes/+page.svelte`, `frontend/src/lib/components/calendar/FigmaTextDay.svelte`, `frontend/src/lib/analytics/posthog.ts`, `frontend/test-all.spec.ts`, `frontend/tests/mobile.spec.ts`
- The homepage opens on the first day of poster cards again. The STARTING SOON strip from #762 is gone, with its once-a-minute clock and `.soon` CSS.
- `FigmaTextDay` drops the `until`, `limit`, `label` and `source` props that only the strip used. TEXT mode is unchanged.
- `calendar-soon` leaves `DiscoverySource`, and the strip's desktop and iPhone E2E tests are removed.
- Reconciled with #846: the strip comes off the sidebar layout. #846 left the strip in place and rewrote its E2E tests; those tests are dropped.

---
## 2026-10-25: Header, nav and filters move into a sidebar
**PR**: #846 | **Files**: `frontend/src/routes/+layout.svelte`, `frontend/src/routes/+page.svelte`, `frontend/src/lib/components/layout/{Sidebar,TopBar,PaletteButton}.svelte`, `frontend/src/lib/components/filters/{ProgrammeToggle,SearchBox,DayPills,FilterSections}.svelte`, `frontend/src/lib/components/filters/active-choices.ts`, `frontend/src/lib/stores/shell.svelte.ts`, E2E specs
- One sidebar on every page holds the logo, the nav (What's on, Cinemas, Reachable, Watchlist) and, on the homepage, every filter. From 1024px it sits beside the page and collapses to a burger; below that it opens as a drawer from the left.
- ALL / NEW / REP leads the page with live film counts, next to the burger and a small logo, with the search box underneath on phones. Posters / Text is two icons in the sidebar.
- The first day header names every active filter and the film count, with a Clear button. Filters apply as you tap, and every change sends `filter_changed`, phones included.
- The header, footer, toolbar, mobile filter sheet and house-lights dimmer are gone. The design is the approved "Classic, sidebar only" prototype.

---
## 2026-10-25: Season subtitles, BFI intro credits, Trans Awareness dash
**PR**: #844 | **Files**: `src/scrapers/utils/film-title-cleaner.ts`, `src/scrapers/cinemas/bfi.ts`, `src/scrapers/utils/screening-classification.ts`
- `Heated Rivalry: Season One All-Dayer` stays whole. The colon cleaner was treating the show name as a strand and storing `Season One All-Dayer`.
- BFI no longer stores `Be My Baby + intro by programmer Anton Bitel` as a director. A stats-line credit is unchanged.
- Castle's `Ponyboi - Trans Awareness programme 2026` stores `Ponyboi`, with the strand as the screening note.

---
## 2026-10-24: Listings QA — preview prefixes, Garden performance ids, Traces
**PR**: #840 | **Files**: `src/scrapers/utils/film-title-cleaner.ts`, `src/scrapers/utils/screening-classification.ts`, `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/garden.ts`, `src/scrapers/cinemas/garden-performance.ts`, `scripts/repair-listings-qa-2026-10-24.ts`
- `BFI IMAX exclusive preview: Godzilla Minus Zero` and `Special preview: La Bola Negra` clean to the film title. The prefix is the screening note. A BFI director equal to the raw title is dropped.
- Garden drops a second film attached to the same Savoy performance when the booking page names the other one. Performance 6266328 is The Social Reckoning (15), Tuesday 27 Oct 2026, 3:45pm; the Fatherland 16:00 row is the extra.
- `Women and the World Festival: Traces` cleans to Traces. Other `X: Y` titles are left alone. The Curzon / DocHouse duplicate is left for #837.
- `scripts/repair-listings-qa-2026-10-24.ts` is a dry run unless `--execute`, and was not run.

---
## 2026-10-25: drizzle-orm 0.45.4
**PR**: #843 | **Files**: `package.json`, `package-lock.json`
- Bumps drizzle-orm from 0.45.3 to 0.45.4, replacing Dependabot's #832, which conflicted with main and could not be rebased or recreated.
- 0.45.4 only changes explicit `.prepare(name)` calls on postgres-js. Nothing in `src/` or `scripts/` calls it, and `src/db/index.ts` keeps `prepare: false` for the Supabase pooler.

---
## 2026-10-17: maplibre-gl 6.12 with a bundled tile worker
**PR**: #813 | **Files**: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/components/map/CinemaMap.svelte`
- Bumps maplibre-gl from 5.24 to 6.12, which closes the critical DOM.sanitize XSS advisory (fixed in 6.4.1).
- maplibre-gl 6 loads its tile worker from a file next to its own module. After Vite bundles it that file is missing, so the map showed pins on a blank background. `CinemaMap.svelte` now imports the worker with `?worker&url` and passes it to `setWorkerUrl()`.

---
## 2026-10-16: Five fixes from the code review
**PR**: #827 | **Files**: `frontend/src/routes/{letterboxd,search,map,people/[name]}/+page.svelte`, `.claude/rules/frontend.md`, `src/db/seed-festivals.ts`, `src/db/seed-festivals.test.ts` (new), `src/app/admin/screenings/components/screening-form-modal.tsx`, `src/scrapers/utils/date-parser.ts`, `src/scrapers/utils/date-parser.test.ts`, `scripts/data-check.ts`
- The Letterboxd, search, map and people pages used `--color-muted`, `--color-foreground` and `--color-background`, which `app.css` has never defined. They now use `--color-text-tertiary`, `--color-text` and `--color-bg`, so the Letterboxd IMPORT button has its dark fill and muted text is grey in light mode, dark mode and under the house-lights dimmer.
- Importing `src/db/seed-festivals.ts`, as `alignment.test.ts` does, leaves the database alone. The seeder runs only when the file is executed directly.
- The admin screening form shows and saves London time. It used to show UTC, so a BST screening looked an hour early.
- `data-check` verifies Close-Up screenings. Its verifier was keyed by the legacy id `close-up`, and screenings carry `close-up-cinema`.

---
## 2026-10-04: Frontend routes share their screening, CSS and test helpers
**PR**: #795 | **Files**: `frontend/src/lib/server/api.ts`, `frontend/src/routes/+page.server.ts`, `frontend/src/routes/sitemap.xml/+server.ts`, `frontend/src/app.css`, `frontend/test-all.spec.ts`, `frontend/tests/mobile.spec.ts`
- Home, tonight and this-weekend trim screening rows through one `slimScreening` helper. Map and reachable read cinemas from the root layout, so each makes one fewer `/api/cinemas` call per render.
- The sitemap fetches the 200-film browse payload directly and stops calling `/api/films/sitemap`, which never existed and returned 400 on every render. The XML is byte-identical to main (186,071 bytes, 1,253 URLs).
- `app.css` drops unused tokens and classes, the duplicate `Inter` face and its `.sr-only` copy, and gains one global `.prose` and one `.poster-grid` in place of six scoped copies. Four unused fonts (188 KB) are deleted.
- E2E specs share `dismissConsent` and `expectNoOverflow`. Folding title checks, deleting duplicates and two long-skipped `test.fixme` tests takes the suite from 226 to 198 tests.
- Screenshots of 7 routes at 1440x900 and 390x844 match main pixel for pixel.

---

## 2026-10-04: Frontend dead code and two unused dependencies removed
**PR**: #794 | **Files**: `frontend/src/lib/stores/palette.svelte.ts`, `frontend/src/lib/search/parse-query.ts`, `frontend/src/lib/stores/filters.svelte.ts`, `frontend/src/lib/components/search/ResultsList.svelte`, `frontend/src/lib/utils.ts`, `frontend/package.json`
- Deleted 11 files nothing imported (three calendar components, three palette rows, the recent-searches and media stores, a stub test, `lib/index.ts` and the scaffold favicon), plus store members, props and helpers with zero readers.
- Swapped private duplicates for existing helpers: `formatTime`, `londonClock`, `formatLabel`, `formatHour`, Svelte's `MediaQuery` and a native class array in `Badge`. The palette store drops its 60-second clock interval and routes rows through one path map.
- Uninstalled `clsx` and `@sveltejs/adapter-auto`. The frontend is about 2,050 lines smaller, and svelte-check, vitest, the build, E2E (only the 18 baseline failures) and before/after screenshots show no visible change.

---

## 2026-10-04: Delete dead API code
**PR**: #793 | **Files**: `src/app/api/festivals/route.ts`, `src/app/api/festivals/[slug]/route.ts`, `src/app/api/festivals/festivals.test.ts` (new), `src/app/api/admin/screenings/[id]/route.ts`, `src/app/api/travel-times/route.ts`, `src/lib/cache-headers.ts`, `vercel.json`
- Deleted four handlers nobody calls: `/api/admin/bfi/status`, PATCH and DELETE on `/api/admin/screenings/[id]`, and the GET help stub on `/api/travel-times`.
- The festival routes drop their signed-in branches, the five unused list filters and the two detail flags. The SvelteKit frontend calls both anonymously with no params, and a new route test pins every field it reads. `getUserAwareCacheHeaders` and `PRIVATE_NO_STORE` lost their last callers and are gone.
- Ten routes reuse `BadRequestError` or `handleApiError` for their 400 and 500 bodies. Smaller trims cover `letterboxd/preview` (lookup table), the `toRows` shim, three unused admin analytics types, the empty `register()`, the `trpc` middleware matcher and a `vercel.json` header that repeated the route's own `CACHE_5MIN`.
- The API layer is about 760 lines shorter, and every response field the frontend reads is unchanged.

---

## 2026-10-04: Remove social outreach pipeline, duplicate CI test run and unused dependencies
**PR**: #792 | **Files**: `.github/workflows/social-outreach.yml` (deleted), `scripts/social-outreach/` (deleted), `.github/workflows/test.yml`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/app/api/admin/screenings/route.ts`, `AI_CONTEXT.md`
- Deleted the social outreach pipeline: its workflow, the five files under `scripts/social-outreach/`, the `outreach` and `outreach:dry-run` npm scripts and `apify-client`. It ran 13 times between 2026-02-08 and 2026-05-03 and failed all 13; the repo holds no Apify or Attio secret, and the Apify actors it needs are paid.
- The unit-tests CI job ran the suite twice. `npm run test:coverage` already runs all 2,884 tests and exits 1 on any failure, so the separate "Run tests" step is gone. The frontend E2E job sets `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` to `''` directly, because neither secret exists.
- Removed seven unused packages: `apify-client`, `@turf/turf`, `lottie-react`, `@esbuild-plugins/tsconfig-paths`, `@supabase/supabase-js`, `@types/cheerio` and `eslint-plugin-jsx-a11y`. The lockfile drops 189 entries (axios among them) with zero version changes. eslint-config-next still installs and registers jsx-a11y, so every a11y lint rule keeps firing.
- The admin "create screening" route generates ids with `crypto.randomUUID()`. It used to import `nanoid`, which package.json never listed and which resolved only through another package's copy.

---

## 2026-10-04: Trim dead scraper code
**PR**: #791 | **Files**: `src/scrapers/chains/*.ts`, `src/scrapers/platforms/{savoy,indy}.ts`, `src/scrapers/runner-factory.ts`, `src/scrapers/cinemas/{barbican,garden,peckhamplex,cinema-museum,bertha-dochouse,ica,olympic,prince-charles,riverside-v2,rich-mix-v2}.ts`, `src/scrapers/utils/{screening-accounting,screening-accounting-report,fetch-with-retry,metadata-parser,ical-parser,screening-classification}.ts`
- Removes code nothing reaches: five chain venue helpers, `ChainScraper.scrapeAll`, the `chains/index.ts` barrel, `ScraperResult`, Savoy's `filmTypeOnly` option, the runner's unread `verbose` and always-true `continueOnError`, `PRE_FILTER_REASONS`, the `supplementary` accounting flag, two always-`"unavailable"` attribution fields and their log tokens, and `maxResponseSize`.
- Curzon, INDY and Barbican use `addDaysToDateString(londonDateString(...))` from `src/lib/london-date.ts` in place of three private `londonDateKey` copies. Garden and Peckhamplex parse through the shared `parseUKLocalDateTime`. Scratch comparisons of old and new code over 1.27M (instant, offset) pairs and 5.7M date/time inputs, BST transition days and venue fixtures included, found zero differences.
- Bertha DocHouse and Cinema Museum stop preloading the festival cache they never read, which saves one festivals query per run each.
- 102 insertions and 580 deletions across 32 code files. Screening output is unchanged.

---

## 2026-10-04: Delete dead seasons, festivals and BFI PDF code
**PR**: #790 | **Files**: `src/scrapers/seasons/run-seasons.ts` (new), `src/scrapers/seasons/base.ts`, `src/scrapers/festivals/eventive-scraper.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`, `src/scrapers/bfi-pdf/pdf-parser.ts`, `package.json`
- Deletes code with no caller since the Trigger.dev and Bree schedulers went (#469, #472): the festival watchdog and its probes, the persisting Eventive ingest `scrapeActiveEventiveFestivals`, the BFI ghost cleanup (`bfi-pdf/cleanup.ts`, 423 lines), two unimported barrels and a dozen unused helpers.
- The five copy-paste seasons runners become one `run-seasons.ts <venue>`; the five `npm run scrape:<venue>-seasons` names still work. The seasons scrapers share one `resolveUrl` built on `new URL` and one `splitYear`, and lose fields nothing read (`sourceId`, `filmUrl`, `requestsPerMinute`, `seasonSlugs`).
- The two BFI parsers drop write-only fields (cast, runtime, countries, accessibility flags, notes, `parseErrors`) and share one venue map, month map and title cleaner.
- 1,867 fewer lines of code. The seasons feature, the Eventive dry-run admin route, the reverse-tagger and the standalone BFI import path all stay.

---

## 2026-10-04: Every venue scrape runs through the unified CLI
**PR**: #789 | **Files**: `src/scrapers/cli.ts`, `package.json`, `src/scrapers/runner-factory.ts`, `src/scrapers/base.ts`, `src/scrapers/cinemas/nickel-v2.ts`, `src/scrapers/cinemas/barbican.ts`
- The 26 `scrape:<venue>` scripts keep their names and run `src/scrapers/cli.ts <id>`, which now takes sub-venue args (`npm run scrape:curzon -- soho`) and exits 1 on a failed run. `scrape:all`, `scrape:chains` and `scrape:independents` call `npm run scrape -- --all|--chains|--independents`.
- Deleted the 27 `run-*.ts` runners, `scrape:local`, `load:bfi-manual`, `scrape:snapshot`, five `debug-*.ts` probes, `fetchWithBrowser`, six unregistered scrapers (genesis-v2, electric, rich-mix, lexi-v2, the-nickel, riverside-studios) and the AutoScrape overlay lookup in `BaseScraper`.
- Manual runs now use registry venue metadata, which the runners overwrote with stale copies (for example "Olympic Cinema" for Olympic Studios). About 8,800 lines removed.

---

## 2026-10-04: Remove dead exports and fields in src/lib and src/db
**PR**: #788 | **Files**: `src/lib/posthog-api.ts`, `src/lib/scrape-quarantine.ts`, `src/lib/scrape-run-summary.ts`, `src/lib/event-classifier.ts`, `src/lib/api-errors.ts`, `src/lib/tmdb/*`, `src/lib/posters/*`, `src/db/backfill-posters.ts`, `src/db/enrich-letterboxd.ts`, `src/db/schema/*.ts`
- Deletes exports, fields and helpers that nothing calls or that only their own tests call: `batchMatchFilms`, `getBackdropUrl`, `getFilmVideos`, `findPostersForMany`, `verifyCronSecret`, `RateLimitError`, four PostHog REST wrappers, the two classifier memo caches, the unread `cleanTitle`/`confidence`/`posterStrategy` fields and 36 unused Drizzle type aliases.
- `scrape-progress`, `scrape-checkpoint` and `scrape-run-summary` now share one `atomicWrite` with the same pid+counter temp names. A progress stamp after `tmp/` is deleted mid-run now succeeds on the first write.
- `db:classify-events` drops the 13 s per-film sleep left from the Gemini rate limit; the classifier is pure regex.
- 66 files, about 1,560 net lines removed. 2,502 tests pass, lint 0 errors / 61 warnings, tsc clean.

---

## 2026-10-04: Remove the legacy React site from the root Next.js app
**PR**: #787 | **Files**: `next.config.ts`, `src/app/layout.tsx`, `public/robots.txt`, `.github/workflows/test.yml`, `package.json`
- api.pictures.london now serves only the API, the admin dashboard and Clerk sign-in. The 16 legacy page routes, 82 React components, the zustand stores, 7 hooks and the helpers only they used are deleted: 190 files and about 32,700 lines.
- Legacy page URLs return a 308 to the same path on pictures.london; `/cinemas/:slug/tonight`, `/directors/:id` and `/seasons/:slug` go to the nearest parent page. `robots.txt` disallows all crawling of the API host.
- 15 dependencies leave package.json (react-query, zustand, posthog-js, Vercel Analytics, Google Maps, Testing Library, `@playwright/test` and others), and 57 packages leave the lockfile.
- The required "E2E Tests" check builds the root app with `npm run build`. The old job skipped itself without a database secret and reported green.

---

## 2026-10-04: Delete 72 finished one-shot scripts
**PR**: #786 | **Files**: `scripts/`, `src/scripts/`, `scripts/audit/`, `src/db/`, `scripts/destructive-script-guards.test.ts`, `scripts/data-check.ts`
- Deleted 72 scripts (10,867 lines) that no npm script, workflow, slash command or import reaches: the `/goal` measurement family (10), May incident probes (14), screening-dedupe one-shots made unreachable by the `(cinema_id, source_id)` unique index or the report-only proximity policy (6), row-pinned repairs (9), search/BST verification harnesses (6), other stale top-level scripts (5), unwired `src/scripts` one-shots (6), the React-era front-end audit suite and two April audits (9), and hand-rolled `src/db` runners and seeds (7).
- `destructive-script-guards.test.ts` moves the 18 deleted destructive scripts into its absence list, so none can come back unnoticed.
- Small reuses: `data-check.ts` uses the shared `levenshteinSimilarity`, `CHROME_USER_AGENT_FULL` and `AbortSignal.timeout`; `dedup-judgement/run.ts` uses `mapConcurrent`, which stops pulling new pairs after the first failure.
- Every remaining `npm run` command still works. `npm run reconcile:plan` / `reconcile:apply` cover future phantom-screening cleanup, and `npm run db:seed` covers seeding.

---

## 2026-10-16: New-filter poster test survives repeated cards late in the evening
**PR**: #825 | **Files**: `frontend/test-all.spec.ts`
- The "persisted New filter renders matching posters and titles" test required the first five cards to have five different titles. After about 21:00 today has fewer than five New films left, so the first five cards run on into tomorrow's section and repeat titles, and Frontend E2E failed on every PR until midnight.
- The check now asserts that no title shows two different posters, which is the render glitch it was there to catch. The persisted-filter comparison after reload is unchanged.

---
## 2026-10-04: Remove Gemini-dependent code
**PR**: #785 | **Files**: `src/lib/gemini.ts`, `src/agents/run-agents.ts`, `src/app/admin/agents/`, `src/app/api/admin/anomalies/verify/`, `src/scrapers/pipeline.ts`, `scripts/audit-and-fix-upcoming.ts`, `scripts/data-check.ts`, `package.json`
- Deleted the Gemini client and everything that called it: the scraper-health, link-validator and fallback enrichment agents, the `/admin/agents` page and routes, AI Verify, the data-quality enrichment route, the `ENABLE_AGENTS` pipeline hook and the Stagehand booking verifier. About 4,985 lines go, plus 249 lockfile packages including `@google/genai`.
- `npm run agents:enrich` (DeepSeek) now runs without a Gemini key check. `agents:links`, `agents:health` and `agents:fallback-enrich` are removed, and `audit:fix-upcoming` drops its fallback pass, so its passes run 1 to 7.

---
