# Settings and Dropdown Keyboard Label Accessibility

**PR**: #95
**Date**: 2026-02-06

## Changes
- Added explicit `id`/`htmlFor` pairings and accessible labels to calendar view mode radio options in:
  - `src/components/settings/calendar-view-setting.tsx`
- Moved dropdown keyboard event handling from a non-interactive wrapper `<div>` to interactive controls in:
  - `src/components/ui/dropdown.tsx`
  - Trigger `button`
  - Dropdown `listbox` container

## Impact
- Removes accessibility lint violations in user-facing settings and shared dropdown controls.
- Preserves existing keyboard navigation and selection behavior.
- Improves semantic consistency in reusable UI primitives and preference controls.
