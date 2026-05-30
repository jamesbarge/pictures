# Cinema detail page: remove redundant re-sort of already-ascending date groups

**Date**: 2026-05-30

## Changes
- In `frontend/src/routes/cinemas/[slug]/+page.svelte`, the `groupedByDate` derived value previously did `Object.entries(groupBy(...)).sort(([a], [b]) => a.localeCompare(b))`.
- `futureScreenings` is already sorted strictly ascending by epoch-ms (in the `futureScreenings` derivation just above). `toLondonDateStr` produces `YYYY-MM-DD` keys via a fixed-locale `Intl.DateTimeFormat` and is monotonic non-decreasing in ms. `groupBy` inserts keys in first-seen order, and JS preserves string-key insertion order for non-integer-like keys.
- Therefore the date-string keys are already emitted in chronological order, and the `localeCompare` sort was a guaranteed no-op. Replaced with `return Object.entries(grouped);` and added an explanatory comment.

## Impact
- Cinema detail page (`/cinemas/[slug]`). Removes an O(k log k) comparator plus closure allocation per re-derivation of the grouped-by-date list (k = number of distinct future dates).

## Behavior preservation
- Output order is byte-identical: the keys were already in ascending chronological order before the removed sort ran, so the sort never reordered anything.
- No change to grouping, filtering, or rendered markup. `svelte-check --threshold error` reports 0 errors.
