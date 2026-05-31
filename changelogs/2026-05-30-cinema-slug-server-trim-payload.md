# Cinema detail server load: trim unused screening fields from SSR payload

**PR**: #106
**Date**: 2026-05-30

## Changes
- In `frontend/src/routes/cinemas/[slug]/+page.server.ts`, the `load` function's per-screening map no longer forwards fields the page never renders.
- Dropped `screen` from each screening object.
- Dropped `directors`, `runtime`, and `posterUrl` from each screening's nested `film` object.
- The returned per-screening shape is now `{ id, datetime, format, bookingUrl, film: { id, title, year } }`.
- The `CinemaResponse` interface is unchanged (it still describes the full upstream API response shape).

## Impact
- Cinema detail pages (`/cinemas/[slug]`) list dozens-to-hundreds of screenings. Each previously serialized a `directors` string array and a `posterUrl` string per screening into the SvelteKit `__data`/hydration payload, none of which the component reads.
- Removing them shrinks the serialized SSR/hydration payload and ISR-cached output with zero change to rendered output.

## Behavior preservation
- The `[slug]/+page.svelte` component only reads `screening.datetime`, `screening.format`, `screening.bookingUrl`, `screening.film.id`, `screening.film.title`, and `screening.film.year`.
- The `.screen-count` element in the component renders `cinema.screens` (cinema-level), not `screening.screen`. No reference to `screening.screen`, `film.directors`, `film.runtime`, or `film.posterUrl` exists in the component.
- Therefore dropping these fields produces byte-identical rendered output; only the unused, serialized hydration data is removed.
- Verified with `svelte-kit sync` + `svelte-check --threshold error`: 0 errors.
