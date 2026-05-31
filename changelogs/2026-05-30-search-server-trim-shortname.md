# Search server load: drop unused shortName from cinema payload

**PR**: TBD
**Date**: 2026-05-30

## Changes
- In `frontend/src/routes/search/+page.server.ts`, removed the `shortName: c.shortName` field from the cinema objects returned by the `load` function's `data.cinemas.map(...)`.
- The `SearchResponse` interface still declares `shortName` because it describes the upstream `/api/films/search` response shape — only the field forwarded to the page was dropped.

## Impact
- Shrinks the SSR/serialized data payload for the `/search` route by one field per cinema.
- No change to rendered output: `search/+page.svelte` renders only `cinema.name` and `cinema.area`; `shortName` was never consumed (grep confirms no usage outside the server load).

## Behavior preservation
- The search results page renders identically. `shortName` was dead data in the page payload.
- `svelte-check --threshold error` reports 0 errors (2 pre-existing unrelated warnings in `FollowButton.svelte` and `LetterboxdRatingReveal.svelte`).
