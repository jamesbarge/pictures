# DayMasthead: reuse formatOrdinalDay helper + hoist three Intl formatters

**PR**: TBD
**Date**: 2026-05-30

## Changes
- Replaced the local 31-entry `ORDINALS` record (and the inline `ORDINALS[dayNum] ?? `${dayNum}th`` fallback) with the shared `formatOrdinalDay(dayNum)` helper exported from `$lib/utils` (backed by `ORDINAL_DAYS`, same `?? `${n}th`` fallback). The local record is deleted; the page now imports `formatOrdinalDay`.
- Hoisted the three `Intl.DateTimeFormat` instances that were constructed on every recompute to module-scope consts, matching the cached-formatter pattern in `utils.ts`:
  - `WEEKDAY_LONG` — `{ weekday: 'long', timeZone: 'Europe/London' }` (was inline in the `weekday` derived)
  - `DAY_NUM` — `{ day: 'numeric', timeZone: 'Europe/London' }` (was inline in the `dayNum` derived)
  - `WEEKDAY_SHORT` — `{ weekday: 'short', timeZone: 'Europe/London' }` (was constructed inside the `stripItems` `$derived.by` loop, allocating 4 per recompute)
- The derived values now call `.format(...)` on the reused instances.

## Impact
- `frontend/src/lib/components/calendar/DayMasthead.svelte` only.
- Removes per-recompute formatter allocations on the always-mounted homepage day masthead: 2 per recompute for the title plus 4 per recompute for the day strip, now amortized to one allocation each at module load.
- De-duplicates the ordinal table against the canonical `ORDINAL_DAYS` in `utils.ts`, removing a drift hazard.

## Behavior preservation
- `formatOrdinalDay` uses the identical `ORDINAL_DAYS[dayNum] ?? `${dayNum}th`` mapping for the 1–31 day numbers a real calendar date produces, so the rendered ordinal is byte-identical.
- The hoisted formatters use the same locale (`'en-GB'`) and the same options as the previous inline constructions; `Intl.DateTimeFormat` is stateless, so reusing one instance yields identical strings across all calls and DST.
- No template markup, keys, or option values changed. `svelte-check --threshold error` reports 0 errors.
