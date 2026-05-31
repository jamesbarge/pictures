# Delete orphaned FilterBar.svelte and its 7 exclusively-used filter children

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Deleted `FilterBar.svelte` — the old in-header filter bar superseded by `DesktopFilterSidebar.svelte` in the V2a redesign. It was imported by zero files in `frontend/src`.
- Deleted the 7 children that were imported exclusively by `FilterBar.svelte` (verified in-session that no other module imports them):
  - `SearchInput.svelte` (738 lines)
  - `DateTimePicker.svelte` (505 lines)
  - `CinemaPicker.svelte` (203 lines)
  - `FormatPicker.svelte` (86 lines)
  - `ViewToggle.svelte` (77 lines)
  - `ActiveFilterChips.svelte` (89 lines)
  - `ClearFiltersButton.svelte` (28 lines)
- `FilmTypeFilter.svelte` was intentionally NOT deleted — it is still live via `routes/+page.svelte`.
- The only remaining mentions of these names elsewhere (`palette.svelte.ts`, `search/ResultsList.svelte`, `search/GlobalCmdkBinding.svelte`, `layout/Header.svelte`) are prose comments referencing "the inline SearchInput" pattern, not module imports, so nothing needed rewiring.

## Impact
- Affects: build tooling and the bundler dependency graph only — no shipped, user-facing chunk changes since the deleted components were already tree-shaken (never mounted).
- Perf metric moved: removes ~1,945 lines / 8 Svelte components from the route dependency graph and the `svelte-check` parse/scan cost. Smaller source surface for the compiler and bundler to traverse on every build.

## Behavior preservation
Rendered DOM on every route is byte-identical because the deleted components were never mounted anywhere in the app; verified via `svelte-kit sync` + `svelte-check` (0 errors, 2 pre-existing warnings) and a clean `vite build` (no broken imports), satisfying the acceptance test that `npm run check` and the production build resolve cleanly after deletion.
