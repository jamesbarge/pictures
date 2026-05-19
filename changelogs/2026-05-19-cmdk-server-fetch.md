# cmd+k step 7 — server-fetch wiring + row activation

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step7-server-fetch`

## Changes

### `frontend/src/lib/stores/palette.svelte.ts`
- Added `ServerSearchResponse` type (mirrors `/api/films/search`'s shape with `Omit<…, 'kind'>` since the server returns rows without the discriminator).
- Added `mapResponse(res)` — injects the `kind: 'film'|'cinema'|…` discriminator the server omits so row components stay type-safe.
- Added `fetchServer(q, signal)` — calls the API, drops stale responses (compares `q !== query.trim()` after the await), handles `AbortError` from both `DOMException` and generic `Error.name`.
- Added `scheduleServerSearch()` — 80ms debounce timer + AbortController churn; below `MIN_QUERY_LEN = 2` clears results synchronously and short-circuits.
- Added `activate(row, mode)` and `activateSelected(mode)` — dispatch on `row.kind`. Modes: `open` (default — `goto` + close), `newTab` (`window.open` with `noopener,noreferrer`, palette stays open), `filter` (step 8; currently aliased to `open` for entity rows; filter-action rows no-op).
- Screenings always open their `bookingUrl` externally (`window.open`) regardless of mode.
- Recents re-run the saved query in place — they don't navigate.
- Sized loading/error state via `isLoading` and `serverError` $state for the UI.
- `closePalette()` now clears query + results + isLoading + serverError so re-opening starts fresh.
- `setQuery(v)` triggers `scheduleServerSearch()` only when palette is `open` — prevents background fetches when closed.

### `frontend/src/lib/components/search/CommandPalette.svelte`
- Listbox click delegation: `onclick` on the `role="listbox"` div walks up from `e.target` to find the row's `[role="option"]`, parses `cmdk-opt-N` id, looks up `palette.flatRows[N]`, calls `palette.activate(row, mode)`. Mode inferred from modifier keys (`metaKey/ctrlKey` → newTab, `altKey` → filter, else open).
- Pointer-move on listbox syncs `selectedIndex` to the hovered row so keyboard Enter operates on the cursor-highlighted row.
- Keymap extended: Enter (activate default), Cmd/Ctrl+Enter (newTab), Alt+Enter (filter). All call `palette.activateSelected(mode)`.
- Empty-state copy split: `Searching…` when `isLoading && hasQuery && rowCount === 0`; `No results for "…"` only when not loading.
- Added `tabindex={-1}` + `<!-- svelte-ignore a11y_click_events_have_key_events -->` on the listbox: keyboard activation lives at the document level (handler reads `palette.selectedRow`), so a duplicate listbox keydown would be redundant.

## Impact

- The palette is now actually useful: typing surfaces real films/cinemas/screenings/festivals/seasons within ~100ms (80ms debounce + ~20ms server p95 warm).
- Enter and click both work; modifier keys give power-user behaviours (new tab) that the inline SearchInput didn't have.
- AbortController plumbing means out-of-order responses can never overwrite fresh ones — even on a slow network, the right results land.
- Step 8 will add `intent-to-actions` so filter rows actually mutate the calendar; today they render but no-op when activated.

## Verification

- `npx svelte-check` — 0 errors, 2 pre-existing warnings unrelated to this step
- `npx vitest run` — 50/50 pass (49 parser + 1 store sanity)
- `npm run build` — 3.12s, ✔ done
- Manual: Vercel preview deployment — confirmed cmd+k → query → results → Enter navigates; Cmd+Enter opens in a new tab; Escape restores trigger focus.
