## 2026-06-12: Scrapers capture runtime — Rio, ICA, Garden, Curzon (plan 006)
**PR**: pending | **Files**: `src/scrapers/cinemas/rio.ts`, `src/scrapers/cinemas/ica.ts`, `src/scrapers/cinemas/garden.ts`, `src/scrapers/chains/curzon.ts`, `src/scrapers/utils/metadata-parser.ts`, `src/lib/tmdb/match.ts`, `src/lib/tmdb/client.ts`, `src/scrapers/utils/film-matching.ts`
- Four scrapers that already parsed runtime and threw it away now forward it as `RawScreening.runtime`: Rio (embedded JSON `RunningTime`), ICA (`#colophon` text), Garden (stats line "Director, Country, Year, Runtime"), Curzon (Vista OCAPI `runtimeInMinutes`).
- New shared `sanitizeRuntime()` guard in `metadata-parser.ts`: coerces numeric strings, accepts only the 1–600 minute band.
- Feeds plan 005's runtime cross-check with real data — junk TMDB stubs can now be rejected for these venues. Live-verified: Rio 38/38, Garden 88/88, ICA 19/21 films emit in-band runtimes.
- PR #670 follow-up: runtime-verified matches no longer refetch film details (`MatchResult.details` passes through to `getFullFilmData`).
- Barbican certificate capture (plan step 5) skipped per the plan's YAGNI clause — no consumer exists; decision recorded in the playbook.

---

## 2026-06-12: TMDB matcher — audit trail persisted, year discipline, runtime/director/language signals
**PR**: pending | **Files**: `src/lib/tmdb/match.ts`, `src/scrapers/utils/film-matching.ts`, `src/scrapers/pipeline.ts`, `src/scrapers/types.ts`, `src/config/cinema-registry.ts`
## 2026-06-12: Untrack tasks/ session scratch
**PR**: TBD | **Files**: `.gitignore`, `tasks/todo.md` (untracked)
- tasks/todo.md was accidentally committed in #670 (agent-worktree `git add -A`); removed from tracking and gitignored — it is per-session scratch.

---

## 2026-06-12: Venue scraper fixes (Cinema Museum, David Lean; Close-Up blocked)
**PR**: pending | **Files**: `src/scrapers/constants.ts`, `src/scrapers/cinemas/cinema-museum.ts`, `src/scrapers/cinemas/david-lean.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`, `changelogs/2026-06-12-venue-scraper-fixes.md`
- **Cinema Museum**: SiteGround WAF now 403s both browser UAs and the old self-identifying UA on the iCal feed; switched `fetchPages()` + `healthCheck()` to a generic `CALENDAR_CLIENT_USER_AGENT` ("Google-Calendar-Importer") which gets 200. scrape() → 25 screenings (was failing).
- **David Lean**: fixed a never-worked extractor — date regex demanded 3-letter months but the site writes full names ("June"); now reads listings via `innerText` and strips detailed times before bare-hour scanning to kill phantom 00:xx screenings. scrape() → 49 screenings (was 0).
- **Close-Up**: investigated, left UNCHANGED — every endpoint (incl. iCal-style paths) is behind an interactive Cloudflare Turnstile that rebrowser-playwright cannot solve; documented in the playbook, stopped per the 3-attempt rule.
- Regression tests added per review: david-lean parser fixtures (the never-worked failure mode) + cinema-museum UA pinning on both network paths.

---

## 2026-06-12: TMDB matcher — audit trail persisted, year discipline, runtime/director/language signals
**PR**: pending | **Files**: `src/lib/tmdb/match.ts`, `src/scrapers/utils/film-matching.ts`, `src/scrapers/pipeline.ts`, `src/scrapers/types.ts`, `src/config/cinema-registry.ts`
- Fixed the films INSERT silently dropping `matchConfidence`/`matchStrategy`/`matchedAt`/`letterboxdUrl` — only 4.3% of matched films had any audit trail.
- Current-year hints (screening-year pollution) are stripped before TMDB matching; historical years pass through.
- New match signals: runtime cross-check (rejects stubs/shorts vs features, −0.15 on >30min mismatch), director credit tie-break (+0.15/−0.1, tie-situations only so typical matches add zero API calls), venue original-language prior (+0.05, Ciné Lumière → fr).
- Fixes the class of wrong matches behind Joyland → Kansas doc and Dracula → Besson-instead-of-Jude. The 0.6 confidence floor is unchanged.
- Review hardening: director tie-break no-ops on non-discriminating (dirty/namesake) hints; runtime check survives transient TMDB failures; matchStrategy reflects the hints that actually applied.

---

## 2026-06-12: Scrape circuit breaker and per-venue wall-clock cap
**PR**: pending | **Files**: `src/lib/jobs/scrape-all.ts`, `src/scrapers/runner-factory.ts`, `src/lib/jobs/scrape-all.test.ts`, `src/scrapers/runner-factory.test.ts`
- Added a run-level circuit breaker to the scrape orchestrator: after 3 consecutive connection-level scraper failures (override via `SCRAPE_BREAKER_THRESHOLD`) the run aborts, remaining scrapers and enrichment are skipped, and a Telegram alert fires.
- Added a hard per-venue wall-clock cap (default 10 min, override via `SCRAPE_VENUE_TIMEOUT_MS`) around the entire venue unit — scrape, pipeline phases, retries — so awaits not covered by `withDbTimeout` can no longer wedge the run; chain scrapers get the cap scaled by venue count.
- Why: on 2026-06-09 a wedged Supabase pooler turned four venue scrapes into 13.4h retry loops and took the production DB offline for 13.7h; on 2026-06-11 two runs hung 50/25 min on inter-phase awaits. A wedged DB now costs minutes, not hours.

---

## 2026-06-12: Scrape accuracy audit — handoff plans 004–010
**PR**: TBD | **Files**: `plans/HANDOFF-2026-06-11.md`, `plans/004-…010-*.md`, `plans/README.md`
- Master handoff report + seven self-contained implementation plans from the 2026-06-11 live `/scrape` run and four-way audit (TMDB matching, Letterboxd, scraper metadata, live-DB evidence).
- Key findings encoded: films INSERT drops match audit trail (4.3% coverage); runtime parsed-then-discarded by 4 scrapers; Letterboxd slug-guessing without TMDB anchor; 392 BFI phantom rows (since swept); double-wedge reproduction of the missing circuit breaker.

---

## 2026-06-11: Canonical title patterns and entity decoding
**PR**: #666 | **Files**: `src/lib/title-extraction/patterns.ts`, `src/lib/title-patterns.ts`, `src/scrapers/utils/film-title-cleaner.ts`, title cleanup and audit scripts
- Made the extraction pattern module the single source for event prefixes, suffixes, non-film patterns, and live-broadcast keywords; poster backfill and audits now consume those shared definitions.
- Promoted robust named, numeric, and mojibake HTML entity decoding into `title-patterns.ts` and removed divergent script copies.
- Removed broad private non-film classifiers from destructive audit paths so reclassification and deletion use the curated learned-title contract.
- Ported the 24-hour deletion guard into the CLI audit orchestrator so same-day scrapes matching an event pattern are reclassified, not hard-deleted.

---

## 2026-06-11: User sync routes use bounded batch writes
**PR**: #665 | **Files**: `src/app/api/user/sync/route.ts`, festival sync/follows/schedule routes, `src/lib/sync-batching.ts`, `src/lib/sync-batching.test.ts`, `changelogs/2026-06-11-user-sync-batching.md`
- Capped festival sync collections at 500 items, retained the existing 5,000-item full film-status allowance, and collapse duplicate conflict keys with newest-wins semantics.
- Replaced per-row film-status, festival-follow, and festival-schedule writes with one conflict upsert per collection, with delete + upsert wrapped in a transaction.
- Festival bidirectional sync now fetches metadata once and uses set membership instead of per-row lookups and repeated linear scans.

---

## 2026-06-11: Frontend uses shared London civil-date arithmetic
**PR**: #664 | **Files**: `frontend/src/lib/london-date.ts`, reachable components, filter/date surfaces, tonight/weekend loaders, Letterboxd results, tests, `changelogs/2026-06-11-frontend-london-time.md`
- Reachable deadline presets and labels now construct and render times in `Europe/London`, independent of the visitor's device timezone.
- Added one DST-aware London date helper and replaced duplicate arithmetic across command-palette parsing, filters, film labels, and route loaders.
- Standardized "this weekend" as Saturday through Sunday even when invoked on Sunday; added DST, Sunday, and non-UK-device regression tests.

---

## 2026-06-11: Scraper registry is the single source for orchestration and CLI
**PR**: #663 | **Files**: `src/scrapers/registry.ts`, `src/scrapers/cli.ts`, `src/scrapers/cinemas/riverside-v2.ts`, `src/scrapers/cinemas/rich-mix-v2.ts`, `src/scrapers/run-riverside-v2.ts`, `src/scrapers/registry.test.ts`, `src/config/cinema-registry.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`, `changelogs/2026-06-11-scraper-registry-single-source.md`
- Removed the unified CLI's stale duplicate scraper registry; listing and execution now consume the same registry used by orchestration while retaining established CLI aliases.
- Aligned the registry's Nickel and Rich Mix entries with the canonical V2 scraper implementations used by package commands, and restored the festival tagging the Rich Mix V2 rewrite had dropped.
- Corrected Riverside's scraper and standalone runner to write to canonical cinema ID `riverside-studios`.
- Added regression coverage for canonical/legacy CLI lookup, uniqueness, and Riverside config consistency.

---

## 2026-06-10: Audit quick wins — auth hardening, scraper cleanup, CI visibility
**PR**: #661 | **Files**: `src/lib/auth.ts`, `src/lib/admin-emails.ts`, `src/lib/admin-emails.test.ts`, `src/test/setup.ts`, `package.json`, `.github/workflows/test.yml`, `src/scrapers/run-{curzon,picturehouse,everyman}.ts` (deleted)
- **Cron secret** now compared with `crypto.timingSafeEqual` instead of `===` (no timing side-channel).
- **Admin allowlist is fail-closed**: removed the hardcoded `jdwbarge@gmail.com` default — a missing/typo'd `ADMIN_EMAILS` now grants nobody admin instead of silently falling back to one personal account. (`ADMIN_EMAILS` is set in Vercel prod.)
- **Scraper v1/v2 sprawl removed**: `scrape:curzon/picturehouse/everyman` now point at the v2 runner-factory path; deleted 3 dead `@ts-nocheck` v1 runners and 3 redundant `-v2` aliases.
- **CI E2E gate**: the silent skip when `DATABASE_URL_TEST` is unset is now a loud `::warning::` annotation, so a green check no longer hides that the Playwright suite never ran (non-blocking — PRs still pass).
- From the `improve` codebase audit backlog.

---

## 2026-06-10: Destructive maintenance scripts now default to dry-run
**PR**: #660 | **Files**: `scripts/`, `src/scripts/`, `package.json`, `.claude/rules/data-quality.md`
- Reviewed database-mutating maintenance scripts now require an explicit `--execute` flag before writing.
- Five superseded or dangerous one-off cleanup scripts were removed, including the stale PCC timezone fix and live-deleting “test” script.

---

## 2026-06-10: Letterboxd imports preserve statuses and create films race-safely
**PR**: #659 | **Files**: `src/lib/jobs/letterboxd-import.ts`, `src/app/api/user/import-letterboxd/route.ts`
- Re-importing a watchlist no longer resets existing `seen` or `not_interested` statuses to `want_to_see`.
- Background imports now create-or-select TMDB films safely and insert the film/status pair in one transaction.

---

## 2026-06-10: Declare scraper source-ID partial index in Drizzle
**PR**: #658 | **Files**: `src/db/schema/screenings.ts`, `src/db/schema/screenings.test.ts`
- Declared the existing `(cinema_id, source_id) WHERE source_id IS NOT NULL` unique index in the Drizzle schema.
- Added a schema regression test so future `drizzle-kit generate/push` operations preserve the conflict target used by scraper upserts.

---

## 2026-06-10: iCal export rejects property injection
**PR**: #657 | **Files**: `src/app/api/calendar/route.ts`, `src/lib/ical.ts`, `src/lib/ical.test.ts`, `changelogs/2026-06-09-ical-injection-hardening.md`
- Calendar text serialization now normalizes CRLF and bare carriage returns before escaping, preventing stored fields from injecting new iCal properties.
- Booking links are emitted only when they parse as HTTP(S) URLs; unsafe or malformed URLs are omitted from both `URL` and `DESCRIPTION`.
- Pure serialization helpers now have regression tests covering newline injection and unsafe URL schemes.

---

## 2026-06-10: Mobile filter sheet gains real focus management and cinema search
**PR**: #656 | **Files**: `frontend/src/lib/components/filters/MobileFilterSheet.svelte`, `frontend/src/lib/components/filters/FigmaToolbar.svelte`, `frontend/src/routes/+page.svelte`, `frontend/src/lib/utils.ts`, `frontend/tests/mobile.spec.ts`
- The mobile filter sheet and nested date picker now move, trap, and restore keyboard focus correctly.
- Replaced the decorative cinema-search row with a labeled search input and selectable matching cinema results.

---

## 2026-06-10: Frontend filter vocabulary consolidated and dead filter components removed
**Files**: `frontend/src/lib/constants/filters.ts`, `frontend/src/lib/components/filters/FigmaToolbar.svelte`, `frontend/src/lib/components/filters/MobileFilterSheet.svelte`, `frontend/src/lib/search/vocab/formats.ts`, three deleted filter components
- Desktop and mobile filter surfaces now share canonical genre, decade, and format options. “Sci-fi” stores `science fiction`, Animation is available everywhere, and 4K stores the valid `dcp_4k` screening format.
- Existing persisted `sci-fi` and `4k` selections are migrated to their canonical replacements on hydration.
- Command-palette `4k` queries now apply the same canonical format filter.
- Deleted the zero-import `DesktopFilterSidebar`, `MobileDatePicker`, and `FilmTypeFilter` components and removed stale references.

---

## 2026-06-09: Scraper failures no longer masquerade as successful empty runs
**PR**: #654 | **Files**: `src/scrapers/runner-factory.ts`, `src/scrapers/chains/`, `src/scrapers/cinemas/`
- Chain scrapers now distinguish valid zero-screening results from failed venues, and the shared runner records omitted requested venues as failed.
- Curzon auth/date failures and required-page failures in Barbican, Close-Up, and Phoenix now fail honestly instead of persisting partial or empty success results.

---

## 2026-06-09: Fix scraper BST date parsing
**PR**: #653 | **Files**: `src/scrapers/cinemas/phoenix.ts`, `src/scrapers/cinemas/olympic.ts`, `src/scrapers/cinemas/david-lean.ts`, `src/scrapers/cinemas/genesis.ts`, `src/scrapers/cinemas/close-up.ts`
- Runtime-local date construction no longer shifts affected screenings to the previous day during BST.
- Shared parser rules now cover Genesis ambiguous times and reject invalid David Lean times instead of fabricating midnight.

---

## 2026-06-09: Fix user sync contract and FK safety
**PR**: #652 | **Files**: `src/lib/user-record.ts`, `src/app/api/user/**`, `src/app/api/festivals/[slug]/follow/route.ts`, `frontend/src/lib/stores/sync.svelte.ts`
- Every FK-backed user-data write now ensures the parent user row exists with a conflict-safe insert.
- Production pull sync now consumes the API's status map, and festival follows use one canonical single-follow endpoint.

---

## 2026-06-09: Prevent public caching of personalized festival data
**PR**: #651 | **Files**: `src/app/api/festivals/route.ts`, `src/app/api/festivals/[slug]/route.ts`, `src/lib/cache-headers.ts`
- Authenticated festival responses now use `private, no-store`.
- Anonymous festival responses retain their existing public edge-cache policy.
- Added regression tests for the user-aware cache policy.

---

## 2026-06-09: Require verified Clerk emails for admin access
**PR**: #650 | **Files**: `src/lib/admin-emails.ts`, `src/lib/auth.ts`, `src/middleware.ts`
- Admin allowlist checks now ignore unverified, pending, or unverifiable Clerk email addresses.
- Removed the session-claim email shortcut because it did not prove email ownership.
- Added regression tests for verified and unverified Clerk email records.

---

## 2026-06-09: Patch P0 dependency vulnerabilities
**PR**: #649 | **Files**: `package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`
- Updated the root dependency lockfile to patched non-breaking releases, including Next.js 16.2.7.
- Forced `svelte-clerk` onto patched `js-cookie` 3.0.8 without taking npm's breaking downgrade.
- Root audit now has no high-severity findings; remaining root findings require breaking dependency changes.

---

## 2026-06-05: E2E suite refresh — re-pointed at the redesign + 4 regression locks
**PR**: #648 | **Files**: `frontend/test-all.spec.ts`, `frontend/tests/mobile.spec.ts`, `frontend/tests/command-palette.spec.ts`, `frontend/tests/redesign-regression.spec.ts` (new), `frontend/src/lib/components/pretext/BreathingGrid.svelte` (deleted)
- ~76 spec lines referenced pre-redesign homepage selectors (`.film-card`, `.masthead-title`, `.day-strip`, `.desktop-toolbar`, `aside.sidebar`, `.breathing-grid`, `.sign-in-link`, `.mobile-*`) — passing vacuously. Re-pointed at the redesigned DOM via role-based locators (toolbar, tablists, `.card`/`.film-row`/`.day-header`).
- Command-palette filter-confirmation assertion rewritten for the new toolbar (chip label collapse + panel checkbox checked, replacing the removed sidebar's aria-pressed buttons).
- New `redesign-regression.spec.ts` locks in this week's hand-fixed bugs: fitToFirstRow resize ratchet, split-header selector uniqueness (top + stuck), `--header-height` contract (menu anchors below current chrome), consent-banner z-order (elementFromPoint on the sheet CTA). Stability-tested 24/24 with `--repeat-each=3`.
- `BreathingGrid.svelte` deleted (orphaned since the redesign; zero imports).
- Results: test-all 106 ✓, mobile 52 ✓ (4 skipped), palette 10 ✓, regression 8 ✓ — 176 passed, 0 failed.

---

## 2026-06-05: Card components consolidated onto card-shapes.ts (+ formatLabel helper)
**PR**: #647 | **Files**: `frontend/src/lib/components/calendar/card-shapes.ts`, `frontend/src/lib/components/calendar/FigmaFilmCard.svelte`, `frontend/src/lib/components/calendar/FigmaTextDay.svelte`, `frontend/src/lib/components/calendar/card-shapes.test.ts` (new)
- FigmaFilmCard/FigmaTextDay re-declared inline `Film`/`Screening` interfaces — the exact field-by-field drift `card-shapes.ts` was created to prevent (flagged by the PR #646 type-design review). Both now import `CardFilm`/`CardScreening`.
- The duplicated format-cleaning logic (filter `unknown`/`dcp`, `_`→space, uppercase) is extracted to a single `formatLabel()` in card-shapes.ts, with unit tests (71/71 passing, 4 new).

---

## 2026-06-05: PR-review fixes — dimmer boot/runtime coherence, lazy-import catch, tablet text grid
**PR**: #646 | **Files**: `frontend/src/app.html`, `frontend/src/lib/components/ui/DimmerDial.svelte`, `frontend/src/routes/+page.svelte`, `frontend/src/routes/film/[id]/+page.svelte`, `frontend/src/lib/components/calendar/FigmaTextDay.svelte`, `frontend/src/lib/server/api.ts`, `frontend/src/lib/components/filters/FigmaToolbar.svelte`, `changelogs/2026-06-05-pr-review-fixes.md`
- Five-agent PR review (code/comments/silent-failures/types/tests) found and we fixed:
- **Dimmer boot ↔ runtime mismatch**: app.html's pre-paint script wrote the *old V2a palette* to `<html>` (which the runtime never cleared → header rendered dimmed after reload); it now injects a `<main>`-scoped `#dimmer-boot-style` with the new Spline palette that DimmerDial removes on mount. The dial's own light palette was also stale V2a — at rest it now *removes* the overrides so app.css tokens are the single source of truth. Persistence moved before the DOM guard + try/caught (Safari private mode).
- **Lazy MobileFilterSheet**: added `.catch()` (deploy-skew chunk failure reloads for the fresh manifest) and moved `mobileFilterOpen = true` inside the success path — the FILTERS button can no longer die silently.
- **FigmaTextDay tablet band (640–1023px)**: 5 visible cells were squeezed into a 4-column template, wrapping CINEMA onto an implicit row — now 5 columns.
- **`API_PROXY_TARGET=""`** no longer defeats the fallback (`?.trim() ||`).
- **`DisplayMode`** deduplicated (imported from FigmaToolbar); PR-introduced dead code removed (`mastheadDate` + masthead CSS, `screeningsByCinema`, `trackCalendarExport` import, `.dimmer-wrap`, `.cta.pressed`/`.cta.secondary.active`, `warmLerp`) — svelte-check warnings 13 → 3.

---

## 2026-06-04: Split header — compaction is now literally just scrolling (zero animation)
**PR**: #646 | **Files**: `frontend/src/lib/components/layout/Header.svelte`, `frontend/src/lib/components/ui/Dropdown.svelte`, `changelogs/2026-06-04-split-header-smooth.md`
- Rearchitected after a 10-agent research + 3-proposal judge panel: the sticky shrinking header is replaced by an **in-flow masthead** (big logo + vertical nav) that scrolls away naturally plus a **fixed always-compact bar** that crossfades in (opacity-only) once the masthead passes it. Nothing animates layout — per frame the browser does exactly what plain scrolling does.
- Measured under 4× CPU throttle (50 wheel steps crossing the boundary twice): layout passes **26 → 3-5**, style recalc **216ms → 27-30ms**, dropped frames (>33.4ms) **3 → 0**, worst frame **35.2ms → 17.7ms**.
- Document height is now constant in all states → the scroll-anchoring oscillation is structurally impossible → the hysteresis thresholds + rAF scroll listener are deleted; one IntersectionObserver fires once per crossing.
- Exactly one `nav[aria-label="Main"]`, one home link and one burger exist at any scroll position (bar contents render only while stuck; masthead hands over labels and goes inert) — E2E selector contract preserved, 7/7 header specs pass.
- `--header-height` = masthead height at rest, constant 56px when stuck (Dropdown fallback bumped 49→56px); `data-header-compact` boolean unchanged for the house-lights fade.

---

## 2026-06-04: QA sweep fixes — consent-banner tap theft, mobile popover overflow, year-less meta
**PR**: #646 | **Files**: `frontend/src/lib/components/ui/CookieConsentBanner.svelte`, `frontend/src/routes/film/[id]/+page.svelte`, `changelogs/2026-06-04-qa-sweep-fixes.md`
- Three pre-existing defects surfaced by the 12-agent post-merge QA sweep (none were regressions; all verified by reproduction + git forensics):
- **Consent banner z-index 9999 → 70**: it sat above the MobileFilterSheet (z-80) and stole first-visit taps on the "Show N films" CTA — dead primary button until consent given. Now above page chrome (header 40, dimmer 60) but below modal layers. Also stacks vertically ≤600px (row min-content was 543px wide at 390px viewport).
- **Mobile calendar popover**: anchored absolute positioning couldn't fit the 362px calendar at 390px (11px horizontal scroll); now a viewport-centred fixed overlay under 768px.
- **SEO metas on 266 year-less films** rendered "Title ()" — year interpolation now guarded.
- QA verdicts: Letterboxd reveal ✓, default rating sort ✓, all 14 routes clean console/network ✓, dimmer restore-on-reload ✓, E2E suite 93 passed / 0 failed.

---

## 2026-06-04: Fix card-grid resize ratchet (stuck at 1-per-row after mobile round-trip)
**PR**: #646 | **Files**: `frontend/src/routes/+page.svelte`
- `fitToFirstRow` pinned each day section's width in px, then its ResizeObserver watched the *same pinned box* — which can shrink (parent squeeze) but never grow, so wide → mobile → wide left every day stuck at one card per row.
- Fix: release the pin before each measurement (so cards reflow to the parent's real available width) and observe the parent as well (its width is viewport-driven, immune to the pin).
- Verified round-trip 1440→390→1440 restores 4-across, and 390→1100 lands 3-across.

---

## 2026-06-04: Frontend — scroll-compacting sticky header
**PR**: #646 | **Files**: `frontend/src/lib/components/layout/Header.svelte`, `frontend/src/routes/+page.svelte`, `changelogs/2026-06-04-compact-header.md`
- Header now compacts on scroll: 213px → 65px desktop (205 → 63 mobile). Brand bar 180 → 56px, logo 140 → 40px, nav links flip from vertical stack to horizontal row, padding tightens. Expands again at the top of the page.
- Hysteresis thresholds (compact at scrollY > 180, expand at < 4) — the 176px gap exceeds the ~148px height delta, so browser scroll-anchoring can't oscillate the state.
- `--header-height` measurement moved from a `mobileMenuOpen`-tracking rAF effect to a ResizeObserver — strict superset (also catches viewport resizes), keeps mobile Dropdown/DimmerDial anchored through the animation.
- Header broadcasts `data-header-compact` on `<html>`; the homepage DimmerDial (which shares the header's top-right corner) fades out in compact mode instead of colliding with the nav row, `visibility: hidden` delayed past the fade so it leaves the a11y tree.
- ≤320px keeps compact min-height at 40px so the header never *grows* on scroll at tiny viewports.
- Why: the sticky header pinned ~213px of chrome to every scroll position — a third of a phone screen — for a logo and five links.

---

## 2026-06-03: Search — instant, typo-tolerant, in-browser film/cinema/people search
**PR**: #664 | **Files**: `frontend/src/lib/search/catalog-index-core.ts` (new), `frontend/src/lib/search/catalog-index.svelte.ts` (new), `frontend/src/lib/search/catalog-index.test.ts` (new), `frontend/src/lib/stores/palette.svelte.ts`, `frontend/src/lib/search/result-types.ts`, `frontend/src/lib/components/search/ResultsList.svelte`, `frontend/src/lib/components/search/GlobalCmdkBinding.svelte`, `frontend/tests/command-palette.spec.ts`, `frontend/package.json`
- ⌘K search is now **instant + typo-tolerant**. The catalog (films-with-a-future-screening + cinemas +
  directors) loads ONCE into the browser (`/api/search/catalog`) and is fuzzy-searched client-side with
  **MiniSearch** — **0 network calls per keystroke**. Accent-folding + `fuzzy:0.3` + `prefix` means
  "amelei" → **Amélie**, "scorses" → **Scorsese**. Index is warmed on idle so the first ⌘K is instant.
- **No links out**: dropped **screening** results — they were the only search rows that opened an external
  cinema booking site. Every result now navigates internally (`/film/[id]`, `/cinemas/[id]`, `/people/[name]`).
- **Graceful fallback**: until `/api/search/catalog` is live (needs a backend promote), search falls back to
  the existing server endpoint (minus screenings), so there's no ordering hazard.
- MiniSearch stays in a **lazy chunk** (off the eager layout bundle). Verified: svelte-check 0 errors;
  66/66 unit tests (7 new — typo/accent/director/cinema); production build clean.

---

## 2026-06-03: Search — read-only catalog endpoint (enables instant in-browser search)
**PR**: #664 | **Files**: `src/app/api/search/catalog/route.ts` (new), `src/lib/cache-headers.ts`
- New `GET /api/search/catalog` returns a lean snapshot — **films** (with a future screening) + active
  **cinemas** + **directors** — so the frontend can build a MiniSearch index and serve instant,
  typo-tolerant suggestions with zero per-keystroke server round-trips (frontend lands next).
- Mirrors the live search's `screenings.datetime > now()` filter (every film result is actionable),
  the `/api/directors` `unnest` pattern (no day cap), and `getActiveCinemas()`. Rate-limited like
  `/api/cinemas`; cached **1h edge / 24h SWR** (catalog changes slowly). New `CACHE_1HOUR` constant.
- Verified vs prod DB: 1090 films / 65 cinemas / 717 directors; tsc clean.

---

## 2026-06-01: Frontend — Spline redesign polish + responsive fixes
**PR**: #646 | **Files**: `frontend/src/routes/+page.svelte`, `frontend/src/routes/film/[id]/+page.svelte`, `frontend/src/routes/watchlist/+page.svelte`, `frontend/src/lib/components/calendar/FigmaFilmCard.svelte`, `frontend/src/lib/components/filters/FigmaToolbar.svelte`, `frontend/src/lib/components/layout/Header.svelte`, `frontend/src/lib/components/reachable/ReachableResults.svelte`, `changelogs/2026-06-01-spline-iteration.md`
- **Film detail Showings**: WHERE/WHEN head row (left-aligned, page-bg band), dark date dividers in new "Show all" toggle, whole-row clickable screenings with unified cream hover, cinema column lightened to `--color-bg-subtle`, popover now styled with surface/border/brutalist shadow to match toolbar, last-row bottom corners rounded to match the panel.
- **Homepage cards**: card stretches to full width under 400px (poster auto-sizes via `aspect-ratio: 2/3`), cinema text in screening rows now ellipsizes (display was `flex` which blocked `text-overflow`).
- **Card grid breakpoints fixed**: 4-cards row was never appearing because `page-chrome` padding is 48px at ≥768 (not 32px the calc assumed). Bumped `.page-chrome` and `.day` breakpoints to 703 / 1030 / 1357px to reflect actual padding, so 4-across now actually fits on screens ≥1357.
- **Toolbar responsive overhaul**: `col-narrow` regridded to `1fr 1fr 200px` with explicit child placement so segments (ALL/NEW/REP + POSTERS/TEXT) stay in their own 200px column on the right; `col-wide` min-width 240→316. Mobile breakpoint nudged 767→839 so filters collapse earlier. Mobile FILTERS button sits next to search via grid layout. POSTERS/TEXT toggle hidden under 480px.
- **Icons**: header burger and FILTERS button now share the same line-stroke style as the search magnifying-glass (`stroke-width: 1.4–1.5`, `stroke-linecap: square`, matching viewBox). FILTERS uses a sliders/filter icon with knob dots — no longer a chevron-button.
- **Reachable + Watchlist design language match**: cards/rows use `--color-bg-subtle` resting + `--color-cream` hover (same as Showings), reachable urgency group headers turned into dark bands with cream text (mirroring the date dividers). Watchlist title 12→14px, meta/screening text 10→12px, poster 36×54→48×72px.
- **Page chrome smoothness**: dropped the `@media (min-width: 696px)` max-width drop that caused a ~327px jump at the 1024 boundary going down; chrome now shrinks continuously below 1024.
- Why: tighten the spline redesign before merge — fix the silent 4-cards-never-renders bug and align secondary pages with the same design language so the system reads as cohesive.

---

## 2026-06-01: Temporarily remove sign-in from the site
**PR**: #664 | **Files**: `frontend/src/lib/components/layout/Header.svelte`, `frontend/src/routes/sign-in/[...rest]/+page.ts` (new), `frontend/src/routes/sign-up/[...rest]/+page.ts` (new), `frontend/src/routes/sitemap.xml/+server.ts`
- The prod **frontend** Clerk key is a dev `pk_test_` key, so the hosted SignIn widget renders blank. Until a `pk_live_` key is set, remove sign-in from the UI: dropped the desktop + mobile "Sign in" links from the header (+ their dead CSS), and `/sign-in` / `/sign-up` now `307`-redirect home so the broken widget isn't reachable. `ClerkProvider` stays mounted so watchlist (localStorage) + festival-follow degrade cleanly. Fully reversible (restore the links, delete the two redirect files).
- Drive-by fix: `sitemap.xml` had a `svelte-check` type error (`'updatedAt' in f` narrowed the no-updatedAt union branch to `unknown`) — collapsed both film sources to one `FilmRef` type. `vite build` was lenient so it shipped + is live; svelte-check now clean (0 errors).

---

## 2026-06-01: SEO — dynamic sitemap.xml + robots Sitemap directive
**PR**: #642 | **Files**: `frontend/src/routes/sitemap.xml/+server.ts` (new), `frontend/static/robots.txt`
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

---

## 2026-06-01: BFI scraper hardening — canonical sourceId + retry dead-code + parser tests
**PR**: #664 (#640) | **Files**: `src/scrapers/bfi-pdf/bfi-source-id.ts` (new), `src/scrapers/bfi-pdf/bfi-source-id.test.ts` (new), `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/bfi-parse.ts` (new), `src/scrapers/cinemas/bfi-parse.test.ts` (new), `src/scrapers/bfi-pdf/pdf-parser.ts`, `src/scrapers/bfi-pdf/programme-changes-parser.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`, `scripts/dedup-bfi-sourceid-migration.ts` (new)
- **(Task 6) Retry dead-code + parser tests**: `RETRY_BACKOFF_MS[2]` (60s) was never read (`[attempt-1]` indexes −1/0/1) yet the array length set the attempt count — decoupled into `MAX_SEARCH_ATTEMPTS=3` + `[10s,30s]` so the dead value is gone without dropping a retry. Extracted `parseSearchResultsArray` + `SearchRow` into a pure `cinemas/bfi-parse.ts` and added 7 unit tests (nested arrays, bracket-in-string, escaped quotes, malformed→null). `mapRows`/0-indexed-month test deferred (needs a pure-extraction refactor of the instance-coupled mapper).
- **Bug:** the three BFI ingest paths each built a different sourceId (`bfi-…`/articleId vs `bfi-pdf-…` vs `bfi-changes-…`), so a path flip (Playwright → PDF fallback) produced a different id for the same screening → the `(cinema_id, source_id)` upsert INSERTed a duplicate instead of updating. Same-time NFT1/NFT2 shows could also collapse.
- **Fix:** shared `buildBfiSourceId(cinemaId, title, screen, datetime)` → `bfi-<cinemaId>-<titleSlug>-<screen>-<iso>`, used by all three paths. `screen` normalised to a canonical token (NFT1–4/STUDIO/IMAX/REUBEN) so "Southbank - NFT3" (Playwright) and "NFT3" (PDF) key identically; the screen segment also disambiguates simultaneous NFT1/NFT2 shows. Dropped the articleId variant + dead `extractArticleId`; PDF path now keys on per-screening venue→cinemaId (not the file-level pdfLabel).
- Verified: cross-path equality + NFT disambiguation (unit test + tsx check); `tsc` clean. Dedup dry-run vs prod: 0 current dupes.
- **Deploy sequence (one-time churn):** reformatting changes every BFI sourceId, so the next scrape inserts new-keyed rows alongside the old. After deploy → BFI scrape → run `scripts/dedup-bfi-sourceid-migration.ts --execute` (safe: only removes dupes within a (cinema,film,datetime,screen) partition; preserves legit multi-screen shows). PR held for review — not auto-merged.

---

## 2026-06-01: JW3 cinema scraper — last uncovered London rep/indie venue (Spektrix)
**PR**: #664 | **Files**: `src/scrapers/cinemas/jw3.ts` (new), `src/config/cinema-registry.ts`, `src/scrapers/registry.ts`, `src/scrapers/cli.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`
- Adds **JW3** (341-351 Finchley Road) — the last London rep/indie venue with no coverage. Fetch-based (no browser): 2 calls to the Spektrix v3 read API (client `jw3`) — `GET /events` filtered to `attribute_Genre == "Cinema"` (excludes the centre's talks/languages/classes), `GET /instances?startFrom&startTo` joined by `event.id`.
- `startUtc` is already UTC (append `Z`), so the BST off-by-one that bit the HTML scrapers cannot occur. Booking via verified `…/spektrix/ChooseSeats?EventInstanceId=…`. Poster from `event.imageUrl`; availability from `isOnSale`.
- Verified dry-run vs live API: **109 Cinema events → 81 screenings / 25 films**, Jun 2 → Aug 16, 0 past, all with booking URLs. tsc clean. Registered in cinema-registry + scraper registry + CLI; playbook documented.

---

## 2026-05-31: Search — people search + /people/[name] director & actor pages
**PR**: #664 | **Files**: `src/app/api/films/search/route.ts`, `src/app/api/people/[name]/route.ts` (new), `frontend/src/lib/search/result-types.ts`, `frontend/src/lib/components/search/rows/PersonRow.svelte` (new), `frontend/src/lib/components/search/ResultsList.svelte`, `frontend/src/lib/stores/palette.svelte.ts`, `frontend/src/lib/seo/json-ld.ts`, `frontend/src/routes/people/[name]/+page.{server.ts,svelte}` (new), `frontend/src/routes/directors/+page.svelte`, `scripts/verify-people-search.ts` (new)
- **New discovery axis: search by person.** The command palette now has a **PEOPLE** group — typing a director's name (e.g. "scorsese") surfaces them with their upcoming-film count; Enter → a new `/people/[name]` page. Trigram-matched so typos still hit ("scorses" → Scorsese).
- **`/people/[name]` pages** (ISR + Person JSON-LD): a director/actor's upcoming London showings as a poster grid, sectioned **As Director** / **On Screen**, each film linking to its detail page. Indexable long-tail SEO ("[director] films showing London").
- Backend: `/api/films/search` gains a `people[]` group (directors via `unnest`, mirrors `/api/directors`); new `GET /api/people/[name]` matches director (`= ANY(directors)`) OR cast (`cast @> [{name}]`) joined to upcoming screenings. `/directors` list entries now link to the pages.
- Verified vs prod DB: "Scorsese" → Martin Scorsese (10 films); typo tolerance; person page returns role-flagged films. v1 search group is directors-only (actor-in-results deferred to avoid hot-path jsonb-unnest cost); person pages show both roles.

---

## 2026-05-31: Search — remove 30-day coverage cap + exact-match relevance boost
**PR**: #638 | **Files**: `src/app/api/films/search/route.ts`, `scripts/verify-search-coverage.ts`
- **Coverage fix**: the films search dropped its hard `ns.next_dt < now() + 30 days` upper bound. Verified against prod: **256 of 1,082 upcoming films (24%) had their earliest screening >30 days out and were unsearchable** — repertory titles, retrospectives announced early, festival films. They are now findable; the recency boost keeps soon-showing films at the top.
- **Relevance**: added an exact-title boost (`0.20`, dominates the ~0.03 RRF ceiling so e.g. "amelie" → Amélie #1) and a prefix-title boost (`0.08`). Verified: `D.E.B.S.`, `Possession`, `Ghatak Was Here` now return rank #1 for an exact query (all returned 0 results before).
- The `screenings` result sub-query keeps its near-term window (intentional: a film is findable forever-out and links to its detail page, which lists every screening; individual booking rows stay near-term). No response-contract change; code-reviewed clean.

---

## 2026-05-31: Consolidate 30 CI-green refactor/perf PRs (#606–#636) into one batch
**PR**: #637 | **Files**: 60 files across `frontend/src/{routes,lib}/…` (per-PR detail in #606–#636)
- Merged all **30** file-disjoint refactor/perf branches (`rf/*`, created 2026-05-30) into a single integration branch so they ship in one CI cycle instead of 30 sequential "branch up-to-date" rebases (O(n²) → O(n)).
- All 30 merged cleanly against current `origin/main` — **zero conflicts, zero skips, zero reverts**. None of the refactors' intents were obsoleted by newer main.
- Content: delete unused exports/imports + dead code, hoist `Intl` formatters / constants / weekday arrays out of hot paths, dedupe rating formatting, simplify a `typeof` guard, trim SSR payload fields (cinema-slug / reachable / search / home / festival-slug), and per-frame `getBoundingClientRect` fix in BreathingGrid.
- Behavior-preserving. Verified: `npm run check` → 0 errors (2 pre-existing unrelated warnings), `npm run build` → success. Supersedes individual PRs #606–#636 (excl. already-merged #619).

---

## 2026-05-30: Scraper coverage + freshness pass — end of June 2026
**PR**: #664 | **Files**: `src/scrapers/pipeline.ts`, `src/scrapers/chains/everyman.ts`, `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/olympic.ts`, `src/scrapers/cinemas/david-lean.ts`, `src/scrapers/SCRAPING_PLAYBOOK.md`
- **42P10 upsert keystone**: `(cinema_id, source_id)` upsert lacked `targetWhere source_id IS NOT NULL` for its partial index → Postgres silently dropped every fresh INSERT across all source_id scrapers (Everyman/Curzon/Picturehouse), freezing forward coverage. Re-applied the lost 2026-05-27 fix.
- **BFI fixed with stealth Playwright, no paid proxy**: single wide date-range search per venue (`page_size=2000` → 1 navigation/venue) reading the inline AudienceView `searchResults` array. bfi-southbank → Jul 31, bfi-imax 2 → 94 → Jul 19. PDF importer kept as fallback.
- **Everyman window 30→45 days** (end-of-month no longer clipped → chain reaches Jul 12); **olympic** canonical-id fix (dup cinema); **david-lean** year-rollover fix (phantom 2027 dates).
- Data: full/targeted re-scrapes (no data loss), 8-pass enrichment (poster −54, TMDB −17, synopsis −17, runtime −36), orphan cinema cleanup (nickel/olympic). 0 suspicious times remain.
- Coverage: chains + most independents now ≥ Jun 30; a handful (Peckhamplex, Electric, Barbican, ICA, etc.) sit below only because those venues haven't published end-of-June dates yet (venue-publication limit, confirmed by zero-add re-scrapes).

---

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
**PR**: #664 | **Files**: `src/lib/rate-limit.ts`, `changelogs/2026-05-30-rate-limit-fail-open.md` (new)
- Production was fully down (every API route + SSR returning 500 / `FUNCTION_INVOCATION_FAILED`). Root cause: Upstash Redis hit its 500k-request quota; `checkRateLimit()` (the first call in every route) threw the `max requests limit exceeded` error instead of failing open, 500'ing all DB-backed endpoints before the query even ran.
- Fix: `checkRateLimit` now catches backing-store errors and falls back to the existing in-memory limiter — a rate limiter can no longer take down the whole API.
- Also corrected during triage: prod `DATABASE_URL` env var had a trailing literal `\n` (corrupted db name `postgres\n`, `3D000`) — a latent bug that would have broken queries once past the limiter.

---

## 2026-05-26: BST timezone fix — bfi.ts, rich-mix.ts, rich-mix-v2.ts off by +1h
**PR**: #664 | **Files**: `src/scrapers/cinemas/bfi.ts`, `src/scrapers/cinemas/rich-mix.ts`, `src/scrapers/cinemas/rich-mix-v2.ts`, `src/scrapers/cinemas/bst-regression.test.ts` (new), `scripts/verify-bst-fix.ts` (new), `scripts/diagnose-bst-bug.ts` (new)
- Customer-reported bug: site displayed showtimes 1 hour ahead of reality during BST. Three scrapers were using `new Date(y, m, d, h, mi)` (local-TZ constructor); on the UTC server this stored BST clock-face times as UTC, and the frontend's UTC→Europe/London render added +1h on top. Verified end-to-end against Rich Mix's Spektrix API.
- Fix: route all three through `ukLocalToUTC()` — the project's existing BST-safe helper that Curzon/Picturehouse/Everyman already use.
- Data backfill: 5 BFI duplicates deleted (rows where a correct PDF-source twin existed at -1h) + 210 BFI rows shifted -1h + 79 Rich Mix rows shifted -1h. 294 rows total. Scoped strictly by `source_id` prefix; bfi-pdf and bfi-changes data left untouched.
- Regression test added at `src/scrapers/cinemas/bst-regression.test.ts` (vitest worker hangs in this checkout — pre-existing infra issue, not from this change; manual verify via `TZ=UTC npx tsx scripts/verify-bst-fix.ts` passes 7/7).

---

## 2026-05-20: cmd+k step 10 — E2E spec + production alias promotion + step-9 deferred
**PR**: #664 | **Files**: `frontend/tests/command-palette.spec.ts` (new), `changelogs/2026-05-19-cmdk-step9-deferred.md` (new)
- Step 10: 5-case Playwright spec locks in the cmd+k contract — ⌘K opens / Esc closes, fuzzy query renders Amélie via trigram, Enter on a film row navigates to `/film/[id]`, composite filter-action surfaces for multi-slice queries, Enter on it mutates the calendar (`70mm` + `Horror` pressed in sidebar). All 5 pass cleanly in 15.3s on chromium.
- `openPalette()` helper auto-retries up to 3 times around a bits-ui Dialog mount race in headless: the first synthetic keydown can land before the document-level listener wires up. Worth it — eliminates flakes entirely.
- Production alias promoted: `api.pictures.london` was pinned to a 23-day-old deployment (April 26). `vercel promote` pointed it at the latest production build (step 7), unblocking the new RRF API for the live frontend. Confirmed: pictures.london ⌘K now returns 8 Amélie screenings + film row from a trigram-fuzzy "amelei" query.
- Step 9 (client Orama index) DEFERRED to v2. Server-only p95 ≈100ms already feels snappy; the ~50ms cold→warm gain isn't worth ~88KB bundle + Web Worker + IDB + brotli-wasm build complexity. Documented in `changelogs/2026-05-19-cmdk-step9-deferred.md` with reopen conditions.

---

## 2026-05-19: cmd+k step 8 — intent-to-actions + filters.applyIntent
**PR**: #664 | **Files**: `frontend/src/lib/search/intent-to-actions.ts` (new), `frontend/src/lib/search/intent-to-actions.test.ts` (new), `frontend/src/lib/stores/filters.svelte.ts`, `frontend/src/lib/stores/palette.svelte.ts`
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

## 2026-05-17: Frontend — Spline neo-brutalist redesign (Figma 2070:669)
**PR**: #664 | **Files**: `frontend/src/app.css`, `frontend/src/routes/+page.svelte`, `frontend/src/lib/components/calendar/FigmaFilmCard.svelte` (new), `frontend/src/lib/components/filters/FigmaToolbar.svelte` (new), `frontend/static/fonts/SplineSans.woff2` (new), `frontend/static/fonts/SplineSans-ext.woff2` (new), `changelogs/2026-05-17-spline-redesign.md`
- Full design-token swap to match Figma 2070:669: Spline Sans replaces Fraunces/Cormorant/IBM Plex Mono, black-on-cream (`#eae5c2`) replaces oxblood accent, 4px button radii + 16px day-section radii + 42px outer-card radius replace zero-radius. New `--shadow-brutalist: 4px 4px 0 0 #000` for chips. Spline Sans variable woff2 self-hosted (latin + latin-ext, ~78KB total).
- Homepage rebuilt: white rounded-42 outer card houses PICTURES.LONDON wordmark, FigmaToolbar (ALL/NEW/REPERTORY + WHEN/SEARCH/WHERE/HOW chips with cream icon tiles + POSTERS/TEXT), day sections with black cream-text headers, and `FigmaFilmCard` rows (264px poster + 64px right rail for year/director/format chips, 88px title row, 30px screening rows, rotated MORE bar on overflow).
- Mobile: full-width card with poster + right rail layout preserved, toolbar wraps to 2-up.
- Other pages (`/tonight`, `/this-weekend`, `/about`, `/map`) inherit new tokens cleanly; existing `DesktopHybridCard`/`MobileFilmRow` left untouched (still used by those pages).
- Why: design alignment with Figma direction picked by James — neo-brutalist literary calendar.

---

## 2026-05-17: /goal conditions #8 & #9 — flaky detector + BST sentinel (Phase 1 of scraper-perfection plan)
**PR**: #664 | **Files**: `src/lib/scrape-quarantine.ts`, `src/lib/scrape-quarantine.test.ts` (new), `src/scripts/run-scrape-and-enrich.ts`, `scripts/goal-check-flaky-cinemas.ts` (new), `scripts/goal-check-bst-sentinel.ts` (new), `scripts/goal-status.ts`, `tasks/goal.md`, `changelogs/2026-05-17-goal-ws-a-flaky-and-bst.md`
- Phase 1 of the "make scrapers perfect" plan (WS-A: measurement substrate). Two new end conditions added to `tasks/goal.md`, taking the goal from 7 conditions to 9.
- **Condition #8 — No flaky-critical cinemas**: resurrected `detectFlakyCinemas` (a ratio-based detector that catches alternating-failure cinemas like BFI IMAX in May 2026 — 14/21 success+0 runs but never two consecutive, so the silent-breaker detector missed it). New unit test covers 9 fixture scenarios including the BFI IMAX ground truth, Close-Up failed-runs pattern, threshold-bumping logic, and lastGoodRunAt accuracy. Wired into `/scrape` pre-flight so flakies are surfaced before a 30-60min run wastes time on broken cinemas.
- **Condition #9 — Zero BST-pattern screenings**: standing guardrail for the recurring BST off-by-one bug class that has bitten Curzon, Everyman, and Picturehouse in the last 4 weeks. Queries the 02:00-09:59 UK-local window for upcoming screenings. The 00:00-01:59 zone is deliberately excluded because Everyman, PCC, and Genesis legitimately programme midnight cult screenings (Mulholland Drive, Obsession, Hokum at Everyman Broadgate were flagged during smoke-testing — false positives the wider window would have produced).
- Smoke run confirms both conditions PASS on current data — 2 cinemas at warn-level flakiness (BFI IMAX, Close-Up) but 0 critical; 0 BST offenders in the tightened 02:00+ window.
