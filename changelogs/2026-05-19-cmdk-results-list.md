# cmd+k step 6 — ResultsList + 8 row variants + arrow nav

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step6-results`

## Context

Step 6 of `tasks/cmdk-palette-plan.md`. The palette renders real results once data lands (step 7 wires the server fetch). Adds the 8 row variants matching the property catalog in the plan, plus flat-index arrow navigation across sections.

## Changes

### New types: `frontend/src/lib/search/result-types.ts`
Discriminated union `ResultRow` with 8 variants (FilmResult, CinemaResult, ScreeningResult, FestivalResult, SeasonResult, FilterActionResult, RecentResult, UserStatusResult). `PaletteResults` is the sectioned shape stored in the palette store. `SECTION_ORDER` is the intentional rendering order (recents → actions → screenings → films → cinemas → festivals → seasons → userStatuses). `flattenResults(results)` produces the flat `ResultRow[]` array that `selectedIndex` walks.

### Row components: `frontend/src/lib/components/search/rows/`
Each row is a self-contained `<button role="option">` with the row's discriminated data shape as a prop. They are NOT wrapped in `<li>` — instead they render as direct children of the outer `<div role="listbox">` (matches the existing inline SearchInput pattern, avoids `<li>` invalid-nesting). Visual specs match the design agent's spec:
- **FilmRow** — 36×54 poster, title + year/director sub, optional star rating right-aligned (≥7.0)
- **CinemaRow** — pin icon, name + chain/address sub
- **ScreeningRow** — fixed-width time column ("TONIGHT 19:30"), film title + cinema, format/event tags, sold-out dimming
- **FestivalRow** — 32×32 logo or 3-letter monogram, name + date range + year
- **SeasonRow** — compact 36px single line with director name
- **FilterActionRow** — `[FILTER]` mono chip + label + `⌥N` shortcut hint
- **RecentRow** — clock icon + query string, 32px compact
- **UserStatusRow** — poster + WATCHLIST / SEEN / NOT INTERESTED pill

### `ResultsList.svelte`
Iterates `SECTION_ORDER`, groups items by section, renders a `<div role="presentation">` header per non-empty section followed by the rows. Pre-computes a `layout` array of `{section, row, flatIndex, id}` tuples so each row knows its position for `selected` and `aria-activedescendant`.

### `palette.svelte.ts` (extended)
Added `results: $state<PaletteResults>(EMPTY_RESULTS)`, `flatRows: $derived(flattenResults(results))`, `selectedRow: $derived(flatRows[selectedIndex] ?? null)`. New actions: `setResults`, `selectNext`, `selectPrevious`, `selectFirst`, `selectLast`. `closePalette()` now clears results + selectedIndex so re-opening doesn't show stale data.

### `CommandPalette.svelte`
Replaced the placeholder empty state with `<ResultsList />`. Keydown handler now handles `ArrowDown`/`ArrowUp`/`Cmd+ArrowDown`/`Cmd+ArrowUp` in addition to Escape. `aria-activedescendant` is `$derived` from `palette.selectedIndex`. `data-nav-mode` swaps between `keyboard` and `mouse` on first `pointermove` event so future steps can lock hover when arrow-keying (deferred to step 10 polish — scoped CSS can't reach `[data-nav-mode]` from row components without `:global()`).

Outer listbox switched from `<ul>` to `<div role="listbox">` to avoid `<li>` invalid-nesting warnings (matches inline SearchInput pattern). Section headers are `<div role="presentation">`.

## Verification

- `cd frontend && npm test` — 50/50 pass (49 parser + 1 store sanity)
- `cd frontend && npx svelte-check` — 0 errors, 2 pre-existing warnings (down from 24 after structural refactor)
- Manual: rendering verified by svelte-check + unit tests; full integration deferred until step 7 lands data

## What's NOT in this step (deferred)

- **Server fetch wiring**: `palette.results` is settable but nothing yet writes to it. Step 7.
- **Enter / Cmd+Enter activation**: arrow keys move the selection but Enter does nothing yet. Step 7.
- **Mouse-mode hover lock**: row scoped CSS can't see the `[data-nav-mode]` attribute on the Dialog container without `:global()`. Plain hover works in both modes for now. Step 10 polish.
- **Section caps + "show more"**: the plan calls for FILMS 5 / CINEMAS 4 / SCREENINGS 4 etc. — currently we render whatever the server returns. The API already caps at 12/6/8/5/5, so this is implicit.

## Next

Step 7: wire `palette.query` → `/api/films/search` with 80ms debounce, AbortController, and stable-id merge. The plumbing already exists at `apiGet` and the endpoint already returns the correct shape from step 2 — it's a ~50-line addition to the palette store's `$effect`.
