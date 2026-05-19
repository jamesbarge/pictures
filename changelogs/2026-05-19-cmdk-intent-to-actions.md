# cmd+k step 8 — intent-to-actions + filters.applyIntent

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step8-intent-to-actions`

## Changes

### `frontend/src/lib/search/intent-to-actions.ts` (new)
- Pure `intentToActions(parsed: ParsedIntent): FilterActionResult[]`.
- Returns a single composite action when ≥1 actionable slice present (formats / genres / decades / dates / times / repertory).
- Label dynamically composed from slice values; stable id keyed on the slices so the row keeps its identity across keystrokes when the parsed intent didn't change.
- Cinema and chain slices deliberately omitted — slug→UUID resolution is non-trivial; Alt+Enter on a CinemaResult row solves the common case cleanly.

### `frontend/src/lib/search/intent-to-actions.test.ts` (new, 9 cases)
- Empty intent, pure freeText (no slices), single-slice composition, multi-slice composition, stable id, id changes when slice changes, decade rendering, cinema-tokens-deferred guard, repertory.

### `frontend/src/lib/stores/filters.svelte.ts`
- Added `FilterSnapshot` interface + `snapshotForUndo()` + `restoreFromSnapshot()` so step 10's Undo toast can hang off them without re-architecting.
- Added `applyIntent(parsed)` — batch mutator for formats, genres, decades, dateFrom/dateTo, timeFrom/timeTo, and the `repertory` programming type. Existing state for non-mentioned slices survives.
- Dates round-trip via `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' })` so the YYYY-MM-DD strings stay correct across DST boundaries.

### `frontend/src/lib/stores/palette.svelte.ts`
- Imports `filters` and `intentToActions`.
- Synthesises `actions` from `parsed` via `intentToActions(parsed)`, derived per keystroke.
- New `mergedResults` derived merges synthesised actions into the server-returned `PaletteResults` at the top of the section order (`actions` precedes `screenings`/`films`/...).
- `palette.results` getter now returns `mergedResults` so `flatRows`, `selectedRow`, and ResultsList all see the actions in the same flat list.
- `activate()` rewrite: `filter-action` rows always call `filters.applyIntent(parsed)` regardless of mode; `cinema` rows in `filter` mode set `filters.cinemaIds = [row.id]` to narrow the calendar to a single venue; all other entity rows preserve step-7 behaviour.

## Impact

- **The 5-second magic ships.** Users type `horror 70mm tonight` and see one "Apply filters: …" row; one keystroke later, the calendar narrows.
- Filter slices accumulate across queries: applying `horror`, then later applying `tonight`, leaves both active.
- DST-correct date conversion: London tz throughout, no naive UTC arithmetic.
- No new dependencies, no API calls — all logic is local to the frontend.

## Verification

- `npx vitest run` — 59/59 pass (50 prior + 9 new in intent-to-actions.test.ts)
- `npx svelte-check` — 0 errors, 2 pre-existing warnings unrelated to this step
- `npm run build` — 9.86s ✔
- **Live**: typed `horror 70mm tonight` → 3 chips render, "JUMP TO" section appears with one composite action, Enter applies → calendar sidebar shows `Format: 70mm [pressed]`, `Genre: Horror [pressed]`, "Show 0" button (correct — no upcoming horror+70mm tonight). Palette closed, no console errors.
