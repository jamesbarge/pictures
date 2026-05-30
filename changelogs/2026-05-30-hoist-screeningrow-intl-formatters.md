# Hoist the per-row Intl formatters in search ScreeningRow.svelte to module scope

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Moved the three `Intl.DateTimeFormat` builders used by `formatRelativeTime` out of the per-call body into module-scope constants in a new `<script module>` block in `frontend/src/lib/components/search/rows/ScreeningRow.svelte`:
  - `TIME_FORMATTER` — `en-GB` hour/minute 2-digit, `Europe/London`
  - `WEEKDAY_FORMATTER` — `en-GB` weekday short, `Europe/London`
  - `LONDON_DATE_FORMATTER` — `en-CA`, `Europe/London` (used for the same-day comparison)
- Replaced the two inline `new Intl.DateTimeFormat(...)` constructions and the two `toLocaleDateString('en-CA', { timeZone: 'Europe/London' })` calls (each of which allocates a throwaway formatter internally) with `.format()` calls on the hoisted instances.
- `formatRelativeTime` itself moved into the module block; the instance script keeps only the `$derived(timeLabel)` wiring. No markup, props, or styles changed.

## Impact
- Affects the command palette (cmd+k) search results: each `ScreeningRow` is rendered once per screening result, and `formatRelativeTime` previously built up to four `Intl.DateTimeFormat` instances per row on every result update. With N rows that was up to 4N constructor calls (the ICU locale/timezone load is the dominant cost; `.format()` is cheap).
- Metric moved: INP on palette open/typing — removes up to 4 `Intl.DateTimeFormat` constructions per screening row per result update; the formatters are now built once per module load and shared.

## Behavior preservation
Rendered output is unchanged — the formatter configs are constant, so `TONIGHT 19:30` / `SAT 14:00` time labels are byte-identical (verified that `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d)` equals the prior `toLocaleDateString('en-CA', { timeZone: 'Europe/London' })` output). Acceptance test: open cmd+k, type a query returning screening rows, and confirm the rendered time labels are byte-identical to production at desktop and iPhone 12 Pro.
