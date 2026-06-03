# Homepage server load: drop unused meta payload

**PR**: #109
**Date**: 2026-05-30

## Changes
- Removed the `meta: { total, startDate, endDate }` key from the object returned by the homepage `load` in `frontend/src/routes/+page.server.ts`.
- A repo-wide grep confirmed the only references to `.meta.total/startDate/endDate` were the lines building this object; the homepage `+page.svelte` and client components never read `data.meta`.
- Left the `meta` field on the local `ScreeningsResponse` interface intact, since the upstream `/api/screenings` response genuinely returns it and the interface documents the real fetch shape (it is simply no longer forwarded to the page).

## Impact
- Trims dead data from the SSR/ISR payload on the homepage LCP path, with zero consumers affected.
- The separate `meta: data.meta` return in `frontend/src/routes/film/[id]/+page.server.ts` is a different file and out of scope; it is unchanged.

## Behavior preservation
- No consumer read `data.meta` on the homepage, so removing it cannot change any rendered output or runtime behavior.
- The shape passed to the page is otherwise byte-identical (same `screenings` array, same mapping).
- `svelte-check --threshold error` reports 0 errors; the two remaining warnings are pre-existing and in unrelated files.
