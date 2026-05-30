# Memoize cluster membership in DesktopFilterSidebar/MobileFilterSheet so toggling a cinema chip doesn't rescan all cinemas x4 (+1 related perf fixes)

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- **Memoize area-cluster membership** in both `DesktopFilterSidebar.svelte` and `MobileFilterSheet.svelte`. Cluster-to-cinema-ID membership is a pure function of the `cinemas` prop, so it is now precomputed once into a `$derived` `Map<label, ids[]>` keyed only on `cinemas` (built via the shared `cinemasInCluster`). `isAreaActive`/`toggleArea` now look up the cached ids by label and only the `cinemaIds.every(...)` active check depends on the current selection. Previously `{#each AREA_CLUSTERS}{@const active = isAreaActive(...)}` rescanned all ~57 cinemas (lowercasing each `address.area` and running a nested `cluster.areas.some(... toLowerCase())`) for all 4 clusters on every `filters.cinemaIds` mutation — i.e. on every chip toggle. The full scan now runs once per `cinemas` change instead of 4x per toggle.
- **Hoist `cinemasWithinRadius` out of `DesktopFilterSidebar` markup**. Added a `$derived` `withinIds = cinemasWithinRadius(WITHIN_RADIUS)` (the function already short-circuits to `[]` when coords are absent). `withinActive` now consumes `withinIds`, `toggleWithin` reads `withinIds`, and the loc-note markup guard uses `withinIds.length === 0`. Previously the haversine scan (`sin/cos/atan2` over every cinema with coords) ran both inside `withinActive` and inline in the markup guard, executing twice per render whenever location is granted.

## Impact
- Affects users interacting with the Where filter on the home/calendar filter surfaces (desktop sidebar + mobile sheet).
- Perf metric moved: **INP on filter-chip toggle** — eliminates 4 full cinema-array scans + nested lowercasing per toggle. On desktop, when geolocation is granted, **hydration/INP** also improves by collapsing the duplicate haversine-over-all-cinemas pass to a single memoized pass.

## Behavior preservation
Rendered output is byte-identical — same cluster ids (cached arrays are built by the same `cinemasInCluster` in `cinemas` order), same `aria-pressed`/active state, same toggled `cinemaIds` set, and the same `withinActive` state + loc-note branches. Acceptance: Playwright desktop (>=1024px) and mobile — load home, open filters, click each area chip (Soho & West End, East, South, North) and the Within chip with geolocation mocked, and assert `aria-pressed` toggling and the rendered grid counts match main for the same click sequence.
