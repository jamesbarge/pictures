# Trim cinemas/+page.server.ts return to the 5 fields the list renders

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- `frontend/src/routes/cinemas/+page.server.ts` now maps the `/api/cinemas` response to only the fields the list actually renders: `id`, `name`, `chain`, an `address` object with only `area` (or `null`), and `features` (kept whole — the component slices to the first 3 client-side).
- Replaced the `Cinema[]` passthrough type with a narrow inline `CinemasResponse` shape, mirroring the trimming already done in `+layout.server.ts`. The unused `Cinema` import was swapped for the still-needed `CinemaFeature` type.

## Impact
- Affects the SSR HTML for `/cinemas` (~59 cinemas). Drops `coordinates`, `screens`, `programmingFocus`, `website`, `bookingUrl`, `imageUrl`, `description`, `isActive`, `shortName`, and `address.street/postcode/borough` from the devalue-serialized `__sveltekit` data script.
- Metric moved: SSR data-prop bytes in the cinemas-page HTML are reduced (notably the long `description` and `imageUrl` strings across all cinemas), shrinking the initial HTML payload.

## Behavior preservation
- Rendered DOM is byte-identical: the component only reads `id` (href), `name`, `address.area`, `chain`, and `features.slice(0, 3)`, all of which are preserved. Acceptance test: snapshot/screenshot-diff `/cinemas` before vs after (names, areas, chain group headers, first-3 feature badges, count) — identical at 390px and 1280px; svelte-check passes with 0 errors.
