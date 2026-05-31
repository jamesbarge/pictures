# Cinemas index: drop dead groupBy import + hoist search.toLowerCase out of filter

**PR**: #104
**Date**: 2026-05-30

## Changes
- Removed the unused `import { groupBy } from '$lib/utils'` in `frontend/src/routes/cinemas/+page.svelte`. The `grouped` `$derived` reimplements grouping inline and never calls `groupBy`; the symbol appeared only on the import line.
- Hoisted `search.toLowerCase()` out of the `filtered` `.filter` callback. Previously it was recomputed twice per cinema on every keystroke (~118 redundant lowercasings across ~59 cinemas). Now `const q = search.toLowerCase()` is computed once before filtering and reused in both `c.name.toLowerCase().includes(q)` and `(c.address?.area.toLowerCase().includes(q) ?? false)`.
- Converted the `filtered` `$derived` from a ternary expression to `$derived.by` to hold the hoisted local; the empty-search early return preserves the original else branch (`data.cinemas`).

## Impact
- Affects the Cinemas index page (`/cinemas`) only.
- Pure performance/cleanup: fewer redundant string allocations per keystroke and one less dead import. No user-visible change.

## Behavior preservation
- Filtering results are byte-identical: same predicates, same operands, same falsy-search short-circuit returning `data.cinemas`.
- `groupBy` was never referenced beyond the import, so removing it cannot alter runtime behavior.
- `svelte-check --threshold error` passes with 0 errors for the modified file.
