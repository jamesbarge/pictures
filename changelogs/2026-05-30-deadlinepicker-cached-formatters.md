# DeadlinePicker: reuse cached Intl.DateTimeFormat instances in formatSelectedTime

**PR**: #116
**Date**: 2026-05-30

## Changes
- Added a `<script module lang="ts">` block to `frontend/src/lib/components/reachable/DeadlinePicker.svelte` that hoists three module-scope `Intl.DateTimeFormat` constants:
  - `LONDON_DATE_FORMATTER` — `en-CA`, `timeZone: 'Europe/London'` (YYYY-MM-DD)
  - `TIME_FORMATTER` — `en-GB`, `hour: '2-digit'`, `minute: '2-digit'`, `hour12: false` (HH:mm)
  - `DAY_MONTH_FORMATTER` — `en-GB`, `weekday: 'short'`, `day: 'numeric'`, `month: 'short'` ('Mon, 1 Jan')
- Rewrote `formatSelectedTime` to call `.format(d)` on the reused instances instead of constructing a fresh formatter from inline options on every `toLocaleDateString`/`toLocaleTimeString` call.
- Previously the function made up to five formatter constructions per invocation (three `en-CA` London-tz dates, one `en-GB` time, one `en-GB` weekday/day/month).

## Impact
- Frontend only (`reachable/DeadlinePicker.svelte`). The "FINISHED BY" deadline selector renders its selected-time label without rebuilding formatters each call.
- Matches the established hoist pattern already used in `frontend/src/lib/components/search/rows/ScreeningRow.svelte`.

## Behavior preservation
- The hoisted formatter options are identical to the inline options they replace, so the produced strings (`YYYY-MM-DD` comparison keys, `HH:mm` time, `'Mon, 1 Jan'` long form) are byte-identical.
- The time and weekday/day/month formatters intentionally omit `timeZone`, exactly as the original `toLocaleTimeString`/`toLocaleDateString` calls did (runtime-local). Only the `en-CA` date-comparison formatter uses `Europe/London`, again matching the original.
- Verified equivalence with a Node script comparing inline vs hoisted output across multiple dates including the BST transition day — all match.
- `svelte-check --threshold error` passes with 0 errors.
