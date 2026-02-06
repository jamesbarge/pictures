# Mobile Cinema Picker Close-Reset Semantics

**PR**: #98
**Date**: 2026-02-06

## Changes
- Removed the effect that reset `searchTerm` when modal close state changed in:
  - `src/components/filters/mobile-cinema-picker-modal.tsx`
- Added an explicit `handleClose` function that:
  - clears `searchTerm`
  - calls `onClose`
- Applied `handleClose` to:
  - top-right close button
  - footer apply button

## Impact
- Eliminates effect-driven local state updates in a core mobile filter flow.
- Preserves existing cinema search, selection, and apply behavior.
- Reduces render cascade risk and aligns close/reset behavior to direct user actions.
