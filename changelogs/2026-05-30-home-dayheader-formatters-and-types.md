# Homepage day-header: hoist tomorrowIso + type coordinates

**PR**: TBD
**Date**: 2026-05-30

## Changes
- `frontend/src/routes/+page.svelte`:
  - Hoisted the per-render `tomorrowIso` IIFE out of the `{#snippet dayHeader}`
    into a single component-scope `const tomorrowIso = $derived.by(...)` keyed
    off `todayStore.value`. The IIFE previously re-ran for every visible day
    header (up to `MAX_DAYS_VISIBLE = 7`) on every filter-change re-render,
    even though its only input is the `today` store value. It now recomputes
    once per `today` change.
  - Added `coordinates: { lat: number; lng: number } | null` to the `cinemas`
    `$derived` cast type. `DesktopFilterSidebar` and `MobileFilterSheet` read
    `c.coordinates` / `c.coordinates!` for the haversine radius filter; the cast
    previously omitted the field, so the prop contract was unchecked at the
    boundary. The shape matches what `+layout.server.ts` already emits.
  - (The two inline `Intl.DateTimeFormat` formatters were already hoisted to
    module-scope consts in a prior change; no change needed there.)

## Impact
- Affects the homepage (`/`) render path only. Slightly less work per
  filter-change re-render (one `tomorrowIso` computation instead of up to 7),
  and a stronger compile-time type contract for the cinema list passed to the
  filter sidebars.

## Behavior preservation
- Output is byte-identical. `tomorrowIso` uses the exact same UTC-noon anchor
  (`todayStore.value + 'T12:00:00Z'`), `setUTCDate(+1)`, and
  `toISOString().split('T')[0]` slice as the removed IIFE, so the `relative`
  ('Today' / 'Tomorrow' / null) result is unchanged.
- The `coordinates` type addition is a pure TypeScript cast (type-only, erased
  at runtime). It introduces no runtime code and matches the actual data shape
  already provided by the layout load, so runtime behavior is unaffected.
