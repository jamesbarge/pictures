# MobileFilterSheet: hoist inline Date getUTCDate() for Today/Tomorrow chips

**PR**: #119
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/components/filters/MobileFilterSheet.svelte`, the Today/Tomorrow chips previously rendered `{new Date(today + 'T12:00:00Z').getUTCDate()}` and `{new Date(tomorrow + 'T12:00:00Z').getUTCDate()}` inline in the template, allocating two `Date` objects on every re-render of the open sheet.
- Hoisted these into two instance consts next to the existing precomputed labels:
  - `const todayDay = new Date(today + 'T12:00:00Z').getUTCDate();`
  - `const tomorrowDay = new Date(tomorrow + 'T12:00:00Z').getUTCDate();`
- Template now references `{todayDay}` / `{tomorrowDay}`.

## Impact
- Micro-optimisation for the mobile filter sheet: the two day-number values are computed once per component instance instead of on every render, matching how `today`/`tomorrow`/`todayLabel`/`tomorrowLabel` are already handled in the same `<script>` block.

## Behavior preservation
- Byte-identical output. `today` and `tomorrow` are fixed instance consts for the component lifetime, so `getUTCDate()` always returns the same numbers. The displayed day numbers in the Today/Tomorrow chips are unchanged; only the computation is moved out of the render path.
