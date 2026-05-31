# Festival detail: drop dead type import + decorate-sort the per-group screenings

**PR**: #110
**Date**: 2026-05-30

## Changes
- Removed the unused `import type { ScreeningWithDetails } from '$lib/types'` from `frontend/src/routes/festivals/[slug]/+page.svelte` (single occurrence; type-only, erased at compile time).
- Reworked the `filmGroups` `$derived.by` sort to decorate each screening once with `_ms = new Date(s.datetime).getTime()` and compare `a._ms - b._ms`, instead of allocating two `Date` objects per comparator call. Mirrors the established decorate-sort pattern in `this-weekend/+page.svelte`.

## Impact
- Festival detail page (`/festivals/[slug]`) only. Reduces `Date` allocations and `Date.parse` work during the per-film-group sort from O(n log n) parses to O(n) parses, where n is the screening count for the festival.
- No user-visible change; identical sort order and rendered output.

## Behavior preservation
- The removed import was never referenced (grep-confirmed single occurrence) and is type-only — erased at compile time, so runtime output is byte-identical.
- `new Date(x.datetime).getTime() - new Date(y.datetime).getTime()` and `x._ms - y._ms` produce identical comparator results because `_ms` is exactly `new Date(s.datetime).getTime()` computed once per screening. Sort stability and order are unchanged.
- `svelte-check --threshold error` reports 0 errors; the only warnings are pre-existing and in unrelated files.
