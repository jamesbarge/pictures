# Calendar Loader Derived Auto-Load State

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Replaced effect-based auto-load state updates in `src/components/calendar/calendar-view-loader.tsx` with derived required-load calculations from `dateTo`.
- Kept explicit user-triggered load progression via dedicated manual load state.
- Preserved current data-fetch query enablement logic while removing effect-driven state updates.

## Impact
- Eliminates a `setState`-in-effect warning in the core calendar listing flow.
- Keeps auto-load behavior deterministic and easier to reason about.
- Maintains user-visible load-more behavior and query boundaries.
