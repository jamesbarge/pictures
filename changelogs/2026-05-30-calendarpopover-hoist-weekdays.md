# CalendarPopover: hoist inline weekday-header array to a module const

**PR**: #121
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/components/filters/CalendarPopover.svelte`, added a top-level `const WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];` alongside the existing `MONTH_NAMES` const.
- Updated the weekday-header loop from `{#each ['Mo','Tu','We','Th','Fr','Sa','Su'] as d, i (d + i)}` to `{#each WEEKDAYS as d, i (d + i)}`.

## Impact
- The 7-element weekday array is now allocated once at module scope instead of on every render (e.g. each month-navigation click). Tiny allocation/GC reduction in a frequently-re-rendered popover.
- Matches the file's own `MONTH_NAMES` convention for static label arrays.

## Behavior preservation
- Identical data, identical keys (`d + i`), identical iteration order and rendered output. The `class:is-weekend={i >= 5}` logic is unchanged because the array contents and order are byte-identical.
- Verified with `svelte-kit sync` + `svelte-check --threshold error`: 0 errors, no new warnings in this file.
