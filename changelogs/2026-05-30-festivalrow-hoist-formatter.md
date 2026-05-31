# FestivalRow: hoist date-range Intl.DateTimeFormat to script module scope

**PR**: #117
**Date**: 2026-05-30

## Changes
- Moved the constant `Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', timeZone: 'Europe/London' })` out of the `dateRange` `$derived.by` body and into a new `<script module>` block as a shared `const RANGE_FORMATTER`.
- `dateRange` now references the hoisted `RANGE_FORMATTER` instead of constructing a new formatter on every recompute.
- Mirrors the existing pattern in the sibling `ScreeningRow.svelte` (`<script module>` with `TIME_FORMATTER`/`WEEKDAY_FORMATTER`/`LONDON_DATE_FORMATTER`).

## Impact
- Affects the search results UI (`frontend/src/lib/components/search/rows/FestivalRow.svelte`).
- The formatter is now built once per module load and shared across all `FestivalRow` instances, rather than reconstructed per derived recompute per row.

## Behavior preservation
- The formatter arguments are fully constant, so the formatted date-range output is byte-identical to the per-call builder.
- No change to component props, markup, styles, or rendered text. Purely a hoist of a constant object construction to module scope.
