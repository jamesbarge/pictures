# BreathingGrid: read getBoundingClientRect once per frame instead of per cell

**PR**: #103
**Date**: 2026-05-30

## Changes
- `getCharScale` no longer calls `containerEl.getBoundingClientRect()` internally. It now accepts a pre-computed `rect: DOMRect | null` parameter and uses it for the hover-proximity math.
- Added a small `getFrameRect(mx)` helper that returns the container rect once (under the same `mx > -500 && containerEl` guard as before) or `null` when the pointer is not over the header.
- The template computes `{@const frameRect = getFrameRect(mouseX)}` once per render (before the `{#each chars}` loop) and passes it into every `getCharScale` call.

## Impact
- Affects only the always-mounted header logo animation (`BreathingGrid.svelte`).
- During pointer hover over the header, forced layout reads drop from O(cells) (~14 `getBoundingClientRect()` reflows per frame at 60fps) to O(1) per frame.
- No visual or API change; no other files touched.

## Behavior preservation
- The rect is read under the exact same condition as before (`mx > -500 && containerEl`); when the guard is false `getFrameRect` returns `null` and `getCharScale`'s hover branch is skipped, identical to the prior `mx > -500 && containerEl` check.
- All cells render in a single synchronous pass, so the layout cannot change between cells within one frame — every cell previously observed the identical rect anyway. Computed `scale` values are byte-identical.
- `svelte-check --threshold error`: 0 errors; no new warnings introduced for this file.
