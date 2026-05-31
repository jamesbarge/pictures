# Map page: drop dead page import + remove any cast on venue-count filter

**PR**: #113
**Date**: 2026-05-30

## Changes
- Removed the unused `import { page } from '$app/state'` from `frontend/src/routes/map/+page.svelte`. The only "page" matches in the file are the `.map-page` CSS class and the `aria-labelledby="map-heading"` attribute — neither uses the imported `page` store. Dropping it removes `$app/state` from this page's module graph.
- Removed the `: any` cast on the venue-count filter callback: `cinemas.filter((c: any) => c.coordinates)` → `cinemas.filter((c) => c.coordinates)`. `cinemas` is `$derived(data?.cinemas ?? [])`, whose elements carry a `coordinates: { lat; lng } | null` field (from the root layout load), so `c` now infers correctly and the `c.coordinates` access stays type-checked.

## Impact
- Frontend `/map` route only. No user-facing or runtime behaviour change.
- Slightly leaner module graph (no `$app/state` pulled in) and stronger type checking on the venue count.

## Behavior preservation
- Identical runtime output. The removed import was never referenced, so eliminating it changes no executed code. Removing the `any` cast is a compile-time-only change — the emitted JavaScript for the filter is byte-identical (TypeScript/Svelte type annotations are erased at build). `npx svelte-check --threshold error` reports 0 errors.
