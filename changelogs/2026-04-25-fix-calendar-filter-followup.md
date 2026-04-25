# Address retroactive review of calendar-filter extraction

**PR**: TBD
**Date**: 2026-04-25

## Why
The original extraction (commit `c5733f93`) landed direct on `main` due to a local-HEAD slip during a `gh pr create` failure recovery, bypassing the PR-review gate the project mandates. A retroactive Code Reviewer agent run on the diff surfaced two should-fix items, three nits, and a missing changelog `## Impact` section. This PR closes the gate-violation by addressing all of them.

## Changes

### `frontend/src/lib/calendar-filter.ts`
- **`CalendarScreening` interface slim.** Removed fields the helper never reads: `bookingUrl`, `film.runtime`, `film.posterUrl`, `film.letterboxdRating`, `film.tmdbPopularity`, `cinema.shortName`. Reviewer flagged this as payload-shape leakage — the constraint should only require what the function uses; the output type already preserves the caller's full screening shape via `<S>` on `FilmGroup`.
- **One-sided-range invariant warning moved into the helper.** The invariant is "if a future caller of `filters.dateFrom`/`filters.dateTo` setters assigns one without the other, we silently default the missing end to today" — that's a property of `buildFilmMap`'s input, not of the calling component. A module-scope `lastOneSidedRangeWarnKey` dedup variable lives next to the helper, gated on `import.meta.env.DEV`. `+page.svelte`'s component-scope `oneSidedDateRangeWarnKey` is gone.
- **Loop body micro-cleanups.** Hoist `s.film` to a local `const film` after the null guard so subsequent reads use the narrowed local. Cache `new Date(s.datetime)` once per iteration so the now-check and the time-of-day filter share the parse. Pass radix `10` to `parseInt`.

### `frontend/src/routes/+page.svelte`
- Removed the now-redundant one-sided-range warning block and the `oneSidedDateRangeWarnKey` declaration. The `filmMap` derivation is now a single `buildFilmMap(...)` call.

### `changelogs/2026-04-25-refactor-extract-filmmap-helper.md`
- Added the `## Impact` section the original changelog was missing per the project template in `CLAUDE.md`.

## Impact
- **No user-facing change.** Lock-in test from #447 still passes against the refactored helper, confirming behaviour-preservation.
- **Tighter helper contract.** Future test fixtures can pass leaner objects — only the fields actually used by the function are required.
- **Invariant lives next to the code that depends on it.** Moving the warning into `calendar-filter.ts` means a second consumer of `buildFilmMap` (e.g. a future Tonight or Reachable view) gets the same drift detection for free.

## Verification
- `npx svelte-check --threshold error` — no new errors (11 pre-existing in unrelated files).
- `Homepage > listings under each poster default to today and follow the day strip` Playwright lock-in: passes in 3.1 s. Confirms behaviour-preservation through both the original extraction and this follow-up.

## Files
- `frontend/src/lib/calendar-filter.ts`
- `frontend/src/routes/+page.svelte`
- `changelogs/2026-04-25-refactor-extract-filmmap-helper.md`

## Out of scope
- Wiring Vitest. Still deferred per the user's earlier revert.
