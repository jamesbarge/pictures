# Directors page: hoist query lowercasing out of the filter loop

**PR**: #123
**Date**: 2026-05-30

## Changes
- In `frontend/src/routes/directors/+page.svelte`, the `filtered` derived value previously called `search.toLowerCase()` once per director on every keystroke inside the `.filter()` predicate.
- Switched the derived to the `$derived.by(() => {...})` form so the lowercased query can be computed once (`const q = search.toLowerCase();`) and reused across all directors in the filter.
- The empty-search short-circuit (returning `data.directors` unfiltered) is preserved.

## Impact
- Frontend only. The directors API returns every director across the next 14 days with no LIMIT (realistically several hundred entries), so this removes hundreds of redundant `toLowerCase()` calls per keystroke during search.

## Behavior preservation
- Identical output. The filter predicate, the case-insensitive matching, and the empty-search branch are unchanged. `q` is exactly `search.toLowerCase()`, the same value previously recomputed inline per director. No change to rendering, ordering, or filtering results.
