# Watchlist: drop dead Badge import, narrow sortBy union, hoist now out of filter

**PR**: #111
**Date**: 2026-05-30

## Changes
Three small, behavior-preserving cleanups in `frontend/src/routes/watchlist/+page.svelte`:

- Removed the unused `import Badge from '$lib/components/ui/Badge.svelte'`. The symbol was only referenced on its own import line (grep-confirmed) and never used in the template or script.
- Narrowed the `sortBy` state type from `'next' | 'added' | 'title'` to `'next' | 'title'`. The `'added'` member was never assigned (only the NEXT and A–Z buttons set `'next'`/`'title'`) and `sortedFilms` has no `'added'` branch, so the value was unreachable.
- Hoisted the current-time read out of the future-screenings filter: compute `const now = Date.now()` once and compare `new Date(s.datetime).getTime() > now`, instead of allocating a fresh `new Date()` per screening inside the predicate.

## Impact
- Affects only the Watchlist page. No change to rendered output, sort behaviour, or filtering results.
- Slightly fewer allocations when computing future screenings; one less unused module import in the bundle.

## Behavior preservation
- Identical runtime behavior. Sorting still supports exactly the two values the UI can produce (`'next'`, `'title'`).
- The filter still keeps screenings strictly after the current instant; `Date.now()` captured once at the start of `loadFilms` matches the practically-equal `new Date()` reads that previously ran microseconds apart within the same synchronous filter pass.
- Removing the dead import has no effect on behavior or output.
