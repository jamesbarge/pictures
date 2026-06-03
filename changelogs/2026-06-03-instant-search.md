# Search — instant, typo-tolerant, in-browser film/cinema/people search

**PR**: TBD
**Date**: 2026-06-03

## What
The ⌘K command palette now serves **instant, typo-tolerant** results with **no links out to external
sites**. Three user-visible changes:
1. **Lightning fast** — results appear with zero per-keystroke server round-trips.
2. **Any term, even misspelled** — "amelei" → *Amélie*, "scorses" → *Scorsese*.
3. **Stays on pictures.london** — search no longer surfaces showtime rows that opened cinema booking sites.

## How
- **In-browser index**: a lean catalog (`/api/search/catalog`: films-with-a-future-screening + active
  cinemas + directors) is fetched ONCE and indexed client-side with **MiniSearch** (FOSS, ~7KB gz, no
  external service, no AI). Search is synchronous → 0ms/keystroke.
  - `frontend/src/lib/search/catalog-index-core.ts` (new) — pure build + search (unit-tested).
  - `frontend/src/lib/search/catalog-index.svelte.ts` (new) — load-once reactive store wrapper.
  - Accent-folding `processTerm` (lowercase + strip diacritics, mirrors the server's `unaccent`) +
    `fuzzy:0.3` (handles 6-char transpositions like "amelei") + `prefix:true`. Film title boosted 3×.
- **Warm on idle**: `GlobalCmdkBinding` dynamically imports + warms the index via `requestIdleCallback`,
  so the first ⌘K is instant AND MiniSearch stays out of the eager layout chunk (lazy-loaded).
- **No external links**: removed the `screening` result kind from the palette — its `activate` branch was
  the only `openInNewTab(bookingUrl)` (external) path. Dropped from `SECTION_ORDER`, `ResultsList`, and
  `palette.mapResponse`. `ScreeningResult` type + `ScreeningRow.svelte` retained but unused (reversible).
- **Graceful fallback**: `palette.svelte.ts` uses the instant index when ready; while it loads (or if the
  catalog endpoint isn't deployed yet / errors) it falls back to the existing debounced `/api/films/search`
  (also screening-stripped). So shipping the frontend before the backend promote degrades gracefully.

## Verification
- `npx svelte-check` → **0 errors** (2 pre-existing unrelated warnings).
- `npx vitest run` → **66/66** (7 new `catalog-index.test.ts`: "amelei"→Amélie, accent-free→accented,
  director→film, typo'd director→person, cinema, kind-discriminator, sub-min-length→empty).
- `npm run build` → clean; MiniSearch confirmed in a **lazy chunk**, not the eager entry/layout.
- E2E (`command-palette.spec.ts`) updated for films-first ordering + a new **no-SCREENINGS** assertion.

## Impact
- Frontend-only → auto-deploys on merge. **Deploy order**: promote the backend `/api/search/catalog`
  endpoint (PR for it lands first) BEFORE merging this, so instant search is live immediately; if merged
  first, search still works via the server fallback until the endpoint is promoted.
