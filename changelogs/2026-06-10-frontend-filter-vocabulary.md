# Frontend filter vocabulary consolidated

## Problem

The live desktop toolbar and mobile filter sheet each declared their own genre,
format, and decade lists. Those lists had already diverged:

- Mobile exposed Animation while desktop could not display or clear it.
- “Sci-fi” was lowercased to `sci-fi`, but film data uses `science fiction`.
- Mobile stored 4K as `4k`, which is not a valid screening format; the canonical
  value is `dcp_4k`.
- Three pre-redesign filter components remained in the bundle source tree with
  no imports.

## Changes

- Replaced stale `COMMON_GENRES` and `DECADES` constants with the live
  `GENRE_OPTIONS` and `DECADE_OPTIONS` vocabularies.
- Made genre options explicit label/value pairs and used them in both live
  filter surfaces.
- Typed `FORMAT_OPTIONS` against `ScreeningFormat`, added `dcp_4k`, and shared
  the complete list between desktop and mobile.
- Made command-palette `4k` and `dcp 4k` queries resolve to `dcp_4k`.
- Deleted `DesktopFilterSidebar.svelte`, `MobileDatePicker.svelte`, and
  `FilmTypeFilter.svelte`, then updated comments that referenced them.
- Added regression tests for canonical option values and query parsing.

## Verification

- `cd frontend && npm test`: 76 passed.
- `cd frontend && npm run check`: 0 errors, 3 existing warnings.
- `cd frontend && npm run build`: SSR and client compilation passed; prerender then
  failed because the isolated worktree could not fetch the API-backed `/about`
  route.
- Focused desktop/mobile Playwright tests were attempted, but Vite refused to
  serve SvelteKit runtime files through the worktree's external `node_modules`
  symlink, so the pages could not hydrate and the tests timed out.
