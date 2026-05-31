# Film detail page: drop dead formatScreeningDate import + remove redundant re-sort

**PR**: #105
**Date**: 2026-05-30

## Changes
- Removed the unused named import `formatScreeningDate` from the `$lib/utils` import block in `frontend/src/routes/film/[id]/+page.svelte`. The token appeared only on the import line — the page builds its own day/relative-date labels (`nextScreeningLabel`, `formatScreeningDate` was never referenced). The other imports (`formatTime`, `toLondonDateStr`, `groupBy`, `getPosterImageAttributes`, `filmByline`, `formatScreeningFormat`) are kept.
- Removed the redundant `.sort(([a], [b]) => a.localeCompare(b))` from the `groupedByDate` derived. Replaced `Object.entries(grouped).sort(...)` with `Object.entries(grouped)` plus an explanatory comment.

## Impact
- Affects the film detail page (`/film/[id]`) only.
- Marginally smaller bundle (one fewer named binding pulled into the route) and skips a comparator-driven sort over the day-group keys on each recompute of `groupedByDate`.

## Behavior preservation
- `formatScreeningDate` was dead code — removing an unreferenced import cannot change runtime behavior.
- `futureScreenings` is already sorted ascending by epoch-ms (decorate-sort-undecorate on `new Date(s.datetime).getTime()`), and invalid dates are excluded because `NaN > now` is `false`. `toLondonDateStr` returns a `YYYY-MM-DD` string that is monotonic in epoch-ms, so `groupBy` inserts day keys in chronological order. JavaScript preserves string-key insertion order, and `localeCompare` over `YYYY-MM-DD` keys produces the identical chronological ordering. The dropped `.sort()` was therefore a provable no-op — `Object.entries(grouped)` yields byte-identical output.
