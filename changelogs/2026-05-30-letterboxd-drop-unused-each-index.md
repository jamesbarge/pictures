# LetterboxdRatingReveal: drop unused loop index in star #each blocks

**PR**: #125
**Date**: 2026-05-30

## Changes
- Removed the unused `, i` loop-index binding from both star `{#each}` blocks in `frontend/src/lib/components/film/LetterboxdRatingReveal.svelte`:
  - `{#each Array(displayStars) as _, i}` → `{#each Array(displayStars) as _}`
  - `{#each Array(Math.max(0, emptyStars)) as _, i}` → `{#each Array(Math.max(0, emptyStars)) as _}`
- The index `i` was never referenced inside either block body (the SVG star markup uses neither the item `_` nor the index).

## Impact
- Affects the rendered Letterboxd rating reveal component only.
- Stops the Svelte compiler from tracking a dead per-iteration index binding for the filled and empty star loops.

## Behavior preservation
- Byte-identical rendered output: both loops still render the same number of `<svg>` stars driven by `displayStars` and `Math.max(0, emptyStars)`.
- No item or index value was ever consumed, so removing the index changes nothing observable at runtime.
- `svelte-check --threshold error` passes with 0 errors.
