# Frontend perf + search-UX batch

**PR**: TBD
**Date**: 2026-04-27
**Branch**: `feat/fe-perf-search-batch-1`

## Background

Two parallel multi-agent research panels (consolidated reports in `Obsidian Vault/Pictures/Research/2026-04-26-frontend-perf-pitches.md` and `2026-04-26-search-pitches.md`) ranked perf and search improvements for `pictures.london`. The user approved the consensus set plus a handful of unique-perspective picks; this PR ships the frontend-only ones. Backend changes (pg_trgm + unaccent + relevance ranking) — the search panel's universal #1 — live in the Next.js API and are queued as a separate PR.

## Changes

### Performance

- **`web-vitals` → PostHog**: Adds `web-vitals` v5 dep (~2 KB gzip, Google-maintained, sole new dep). Registers `onLCP/onINP/onCLS/onTTFB/onFCP` from `frontend/src/lib/analytics/web-vitals.ts`, fires `web_vital` events with `metric_name`, `value`, `rating`, `route`, `viewport`, `viewport_w`, `connection_type`. Replaces PostHog's `capture_performance: true` flag (which captured raw timings without CWV attribution). Loaded in `PostHogProvider.svelte` after PostHog init (already idle-deferred).
- **Homepage payload trim**: `frontend/src/routes/+page.server.ts` `endDate` cut from +30d → +14d. Halves transfer + JSON parse on LCP path. UX Architect's unique pick from the perf panel.
- **`preconnect` + `dns-prefetch`** for `api.pictures.london` added in `frontend/src/app.html` (TMDB already had it). Saves ~150–300ms TLS+DNS on cold mobile.
- **Poster `fetchpriority` + `loading`**: First 1 above-fold poster on mobile (`MobileFilmRow` `priority` prop, applied to `dayGroups[0].films[0]` in `+page.svelte`) and first 4 desktop posters (`DesktopHybridCard` `priority` prop) get `fetchpriority="high"` + `loading="eager"`. Rest stay lazy.
- **`content-visibility: auto` + `contain-intrinsic-size`** on `MobileFilmRow.row` (220px) and `DesktopHybridCard.card` (640px after review tightening). Browser skips layout/paint for offscreen rows. Intrinsic sizes sized to actual rendered card height to avoid CLS on first reveal.

### `film/[id]/+page.svelte` refactor (1,113 → 867 lines, –22%)

- New `frontend/src/lib/components/film/FilmSidebar.svelte` (credits / tagline / status). Rendered eagerly — small, primary content area.
- New `frontend/src/lib/components/film/FilmSimilarRail.svelte` (the "If you like this" rail). Lazy-imported via `requestIdleCallback` after first paint, so the rail's image-heavy markup + CSS don't compete with hero/showings paint. The `>= 2` guard remains.
- Showings section + day picker intentionally left in the main file — primary content + tightly coupled to the popover state. Worth its own PR if we want to keep cutting.

### Search UX (full `SearchInput.svelte` rewrite)

- **iOS zoom prevention** (UI Designer's unique pick, user-flagged): `inputmode="search"` + `enterkeyhint="search"` on the `<input>` (existing `font-size: 16px` was already there, completing the set).
- **`AbortController` per keystroke + debounce 200 → 120ms**: Each new query aborts the previous in-flight request. Drops wasted backend calls and tightens felt latency. Cleaned up in `onMount` teardown.
- **Latency instrumentation**: `trackSearch(q, total, { latencyMs, filmsCount, cinemasCount })` measured via `performance.now()` deltas. Establishes the SLI the backend ranking PR will be measured against.
- **Full ARIA 1.2 combobox**: `aria-activedescendant`, listbox-with-options pattern, visually-hidden `aria-live="polite"` region announcing "X results for {q}" *after debounce settles* (avoids per-keystroke screen-reader spam).
- **Match highlighting**: `<mark>` around case-insensitive query occurrences in result titles, directors, and cinema names. Pure transparent background — no Swiss-style break.
- **Recent searches drawer** (consensus pick + user-flagged "predictions"): New `frontend/src/lib/stores/recent-searches.svelte.ts` — last 5 queries, localStorage-backed, dedup case-insensitively. Shown on input focus when query is empty. Per-row remove + clear-all.
- **Empty-dropdown flash fix**: `handleInput` only opens the dropdown when there's something to show (live results or recents) — prevents a 1-char gap between recents and live results from flashing an empty panel.
- **Recent rows are `<div role="option">`** (not `<button>`) so the inline remove button can nest without invalid HTML. Listbox keyboard nav still works through `aria-activedescendant` from the input.

### `apiGet` extension

- `frontend/src/lib/api/client.ts` now accepts `signal?: AbortSignal` on the options bag, forwarded to `fetch`. Used by SearchInput's AbortController.

## Reverted during implementation

- **Layout cinemas cache**: Initial attempt added `setHeaders({ 'cache-control': ... })` to `+layout.server.ts`. SvelteKit throws on duplicate `cache-control` between layout and page (the homepage and other routes already set their own via ISR). Reverted with an explanatory comment in the layout. Caching of `/api/cinemas` will be addressed at a different layer (upstream API headers + Vercel fetch cache) in a future PR.

## Impact

- Affects every route (web-vitals + preconnect + cinemas in layout).
- Affects homepage (payload trim + poster priority + content-visibility).
- Affects `film/[id]` route (sidebar/similar split).
- Affects header search across all routes (full SearchInput rewrite).

## Verification

- `npm run lint` from root: 0 errors, 41 pre-existing warnings.
- `npm run check` in `frontend/`: 11 baseline errors (all in `letterboxd/+page.svelte`, none in modified files).
- `npm run build` in `frontend/`: clean.
- Code-reviewer agent flagged one blocker (DesktopHybridCard intrinsic-size 360px → 640px) and one minor (1-char empty dropdown) — both fixed before commit.
- Manual smoke test: homepage `200`, `/search?q=blade` `200`, `/film/[real-id]` `200` with all expected sections (breadcrumb, hero, sidebar) rendering.
- Playwright tests need backend dev server (`localhost:3000`) or `API_PROXY_TARGET=https://api.pictures.london` env. Will be exercised on Vercel preview.

## Known trade-offs

- 14-day homepage window: the calendar popover lets users navigate past day-14 with no max. Beyond 14 days they'd see an empty list. User signed off on this when approving the trim. Could be tightened with a `max` on the popover or a "load more" CTA in a follow-up.
- Backend search relevance (pg_trgm + unaccent + ranking) was every search-panel agent's #1 pick but lives in `src/app/api/films/search/route.ts` (Next.js backend). Queued as a separate PR with backend coordination.
