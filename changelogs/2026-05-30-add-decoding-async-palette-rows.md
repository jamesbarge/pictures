# Add decoding=async to UserStatusRow and FestivalRow palette img tags for consistency

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Added `decoding="async"` to the poster `<img>` in `frontend/src/lib/components/search/rows/UserStatusRow.svelte`.
- Added `decoding="async"` to the logo `<img>` in `frontend/src/lib/components/search/rows/FestivalRow.svelte`.
- Both rows already carried correct `width`/`height` and `loading="lazy"`; `decoding="async"` was the one missing hint, bringing them in line with the sibling `FilmRow.svelte` poster.

## Impact
- Affects the command palette (cmd+k) result rows: watchlist/seen status rows and festival rows.
- Performance metric moved: main-thread image-decode time / INP during palette typing. Allowing these small images to decode off the main thread removes tiny synchronous-decode jitter as the user types and result rows swap in/out.

## Behavior preservation
- Rendered output is byte-identical: `decoding="async"` is a non-visual decode hint with no effect on layout, computed styles, or DOM text. Acceptance: render the command palette, surface a watchlist/seen status row and a festival row, screenshot-diff before/after byte-identical, and confirm both `<img>` elements now carry `decoding="async"` matching `FilmRow`.
