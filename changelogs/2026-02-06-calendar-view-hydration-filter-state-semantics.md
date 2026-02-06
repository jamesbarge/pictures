# Calendar View Hydration Filter-State Semantics

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Removed the synchronous `setFilmStatusesHydrated(...)` call from effect setup in:
  - `src/components/calendar/calendar-view.tsx`
- Kept the hydration completion subscription (`onFinishHydration`) behavior unchanged.
- Removed unused `isIndependentCinema` import from calendar view filter logic.

## Impact
- Eliminates a `setState`-in-effect warning in the main calendar view component.
- Preserves hide-seen/hide-not-interested behavior once persisted film-status hydration completes.
- Reduces lint noise and keeps calendar filtering code tighter.
