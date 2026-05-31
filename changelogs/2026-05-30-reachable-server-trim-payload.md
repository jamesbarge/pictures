# Reachable server load: drop unused director + isRepertory from screening payload

**PR**: #107
**Date**: 2026-05-30

## Changes
- In `frontend/src/routes/reachable/+page.server.ts`, removed two dead fields from the per-screening `film` object returned by the `load` function:
  - `director: s.film.directors?.[0] ?? null`
  - `isRepertory: s.film.isRepertory`
- The returned `film` mapping now exposes only `{ id, title, year, runtime, posterUrl }`.

## Impact
- Affects the SSR/ISR payload serialized for the `/reachable` route. With `limit=200`, this trims two dead fields per screening (up to ~200 screenings) from the serialized page data, slightly reducing the SvelteKit data blob size.
- No UI or user-facing change: `reachable/+page.svelte` re-maps `data.screenings` reading only `film.{id, title, year, runtime, posterUrl}`. A repo-wide grep confirms zero consumers of `director` or `isRepertory` for this route.

## Behavior preservation
- The two removed fields were never read by any consumer of the route's data, so the rendered output is byte-identical.
- The incoming API response interface (`ScreeningsResponse`) is unchanged; only the projected payload drops fields that were already unused downstream.
- `svelte-check --threshold error` passes with 0 errors (2 pre-existing warnings in unrelated files).
