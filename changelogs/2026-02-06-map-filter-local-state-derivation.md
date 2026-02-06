# Map Filter Local State Derivation

**PR**: #96
**Date**: 2026-02-06

## Changes
- Replaced effect-based local map area synchronization in `src/app/map/map-page-client.tsx` with derived draft state based on:
  - persisted `mapArea`
  - local override state
- Removed effect-managed `hasChanges` state and computed it directly from current draft/persisted map area comparison.
- Kept all existing map actions intact:
  - apply filter
  - clear filter
  - cancel back to calendar

## Impact
- Removes synchronous state updates inside effects in a core user-facing route.
- Reduces risk of cascading re-renders and keeps map state transitions easier to reason about.
- Preserves current filter behavior while improving state management robustness.
