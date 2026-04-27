# Fix desktop film-grid overflow on wide viewports

**PR**: TBD
**Date**: 2026-04-27
**Branch**: `fix/desktop-grid-overflow`

## Symptom

On desktop viewports — visible most clearly at ≥ 2560px but present from 1280px upward — the homepage film grid blew past the centered 1400px shell. Posters appeared at ~640px wide each, only ~2.5 columns were visible, the third+ posters were clipped at the right edge of the viewport, and there was a horizontal page scrollbar.

Reported by visual inspection at 2560×1440 ([screenshot context: `Thursday, the thirtieth`]).

## Root cause

A two-feature CSS interaction introduced by #468 (the perf + search-UX batch shipped earlier on 2026-04-27):

1. `frontend/src/lib/components/calendar/DesktopHybridCard.svelte:161-162` adds:
   ```css
   content-visibility: auto;
   contain-intrinsic-size: auto 640px;
   ```
   This is a CLS-prevention measure for offscreen cards: the browser uses 640px as a placeholder size while the card is outside the viewport.

2. `frontend/src/routes/+page.svelte:389` declared the grid as:
   ```css
   grid-template-columns: repeat(4, 1fr);
   ```

The standard CSS Grid gotcha: `1fr` is shorthand for `minmax(auto, 1fr)`. The `auto` minimum honors each grid item's intrinsic min-width. With `contain-intrinsic-size` setting that intrinsic width to 640px, every column locked to 640px — 4 columns × 640px + gaps overflowed the 1400px shell by ~1.2k pixels.

Browser eval (production, 2560×1440, before fix):
```
shellW: 1400
mainW: 2666           ← should be 1096
gridCols: "640px 640px 640px 640px"   ← should be ~248px each
bodyOverflow: 958px
```

## Fix

Switched all four `grid-template-columns` declarations in `frontend/src/routes/+page.svelte` from `repeat(N, 1fr)` to `repeat(N, minmax(0, 1fr))`. The explicit `0` minimum lets columns shrink below their intrinsic content size and respect the available shell width.

Affected declarations (lines 389, 395, 398, 404):
- Default 4-col grid
- 3-col grid in 1024–1279px range
- 4-col grid (sidebar collapsed, 1024–1279px range)
- 5-col grid (sidebar collapsed, ≥ 1280px)

## Verification

Local dev server, browser-measured grid columns and body overflow:

| Viewport | Cols | Per-column | bodyOverflow |
|---|---|---|---|
| 2560×1440 | 4 | 248px | 0 |
| 1280×900 | 4 | ~248px | 0 |
| 1100×900 | 3 | 237px | 0 |

Visual diff confirmed: 2560px now shows 4 full posters within the centered shell with no horizontal scroll.

## Impact

- Anyone on a desktop viewport ≥ 1280px viewing the homepage: posters now fit within the shell instead of overflowing the right edge.
- No behavior change at < 1024px (mobile layout uses a separate `.mobile-list` flex column, not affected).
- No change to the CLS-prevention `contain-intrinsic-size` on the cards themselves — the placeholder reservation still works as designed for vertical scroll anchoring.

## Why this slipped through

The original perf-batch PR (#468) was reviewed and code-reviewer asked to bump the intrinsic size from 360px → 640px to better match real card height. That review caught a real CLS risk but didn't surface the secondary effect on the parent grid's column resolution — which only manifests when there are many cards AND the viewport is wide enough that `contain-intrinsic-size` skips offscreen ones.
