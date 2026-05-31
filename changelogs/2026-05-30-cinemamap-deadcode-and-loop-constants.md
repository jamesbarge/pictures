# CinemaMap: remove dead validCinemas + hoist marker/popup literal constants

**PR**: #114
**Date**: 2026-05-30

## Changes
- `frontend/src/lib/components/map/CinemaMap.svelte`:
  - Removed the dead `const validCinemas = $derived(...)` block. It was never read — `onMount` recomputes the identical `coordinates` filter inline as `cinemasWithCoords`, and grep confirmed `validCinemas` has no other reference in the component.
  - Added a `<script module lang="ts">` block (matching the established `ScreeningRow.svelte` pattern) hoisting the constant literal strings that `createMarkerElement` and `createPopupContent` previously rebuilt on every call:
    - Marker SVG: `MARKER_WIDTH` (`'20'`), `MARKER_HEIGHT` (`'26'`), `MARKER_VIEWBOX` (`'0 0 20 26'`), `MARKER_PATH_D` (the pin path `d`), `MARKER_PIN_FILL` (`'#1a1a1a'`), `MARKER_CIRCLE_CX`/`CY` (`'10'`), `MARKER_CIRCLE_R` (`'4'`), `MARKER_CIRCLE_FILL` (`'#fff'`).
    - Popup: `POPUP_DIV_PADDING` (`'4px'`), `POPUP_LINK_CSS`, `POPUP_AREA_CSS`.
  - `createMarkerElement`/`createPopupContent` now reference the module-scope consts instead of inline literals.

## Impact
- Map page (`/map`) marker and popup rendering. These builders run once per cinema (dozens of venues), so the literal strings are now allocated once per module load instead of per call.
- Removes a dead `$derived` that re-filtered the full cinema list on every `cinemas` prop change.

## Behavior preservation
- Identical DOM output. The hoisted constants are byte-for-byte the same strings/values that were previously inlined; SVG attributes, path `d`, fills, and popup cssText are unchanged.
- The deleted `validCinemas` had zero readers; the in-`onMount` `cinemasWithCoords` filter (used to place markers) is untouched.
- svelte-check: 0 errors (the 2 pre-existing warnings are in unrelated files).
