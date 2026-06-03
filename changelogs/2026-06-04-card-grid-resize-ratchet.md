# Card-Grid Resize Ratchet Fix

**PR**: #646
**Date**: 2026-06-04

## Changes

- Fixed the homepage card grid getting stuck at one card per row after a wide → mobile → wide viewport round-trip.
- Root cause in `fitToFirstRow` (`frontend/src/routes/+page.svelte`): the action pins each day section's width in px to align the black day-header bar with the card row beneath it, but its `ResizeObserver` observed the **same box it pins**. A pinned box can be squeezed narrower by its parent (so shrinking worked), but it can never grow on its own — so widening the viewport produced no resize event, and even a manual re-measure would have measured cards wrapped inside the stale narrow pin. A one-way ratchet.
- Fix (two halves, both required):
  1. `update()` now clears `node.style.width` **before** measuring, so the card row reflows to the parent's true available width and the first-row measurement reflects current space, not the previous answer.
  2. The observer additionally watches `node.parentElement` (`.page-chrome`), whose width is viewport-driven and immune to the pin — so growth re-triggers measurement.
- The node itself stays observed for content-driven changes (rows collapsing change its height when filters remove cards).

## Verification

- Playwright: 1440px fresh load → 4 cards across (day width 1309); resize 390px → 1 across; resize back to 1440 → **4 across restored**; 390 → 1100 → 3 across (982 cap). Width stable across settled RO cycles (no oscillation).

## Impact

- Anyone rotating a device, dragging a window, or docking/undocking — previously the page degraded permanently to mobile layout until reload.
