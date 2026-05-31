# MobileDatePicker: hoist inline weekday-header array to a module const

**PR**: TBD
**Date**: 2026-05-30

## Changes
- Added a top-level `const WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su']` next to the existing `MONTH_NAMES` const in `frontend/src/lib/components/filters/MobileDatePicker.svelte`.
- Changed the weekday-header `{#each}` block to iterate `WEEKDAYS` instead of an inline array literal.

## Impact
- Avoids re-allocating a 7-element array literal on every render (e.g. month navigation) in the mobile date picker.
- Purely internal; affects only the mobile filter date-picker component.

## Behavior preservation
- Identical rendered output: same seven labels, same order, same `(d + i)` keys, same `class:weekend={i >= 5}` indices.
- Constant data hoisted out of the render path; no logic, markup, or styling changed.
- Consistent with the file's existing `MONTH_NAMES` module const pattern.
