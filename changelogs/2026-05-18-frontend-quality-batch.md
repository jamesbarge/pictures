# Frontend perf + quality batch (30 changes)

**PR**: TBD
**Date**: 2026-05-18

A behaviour-preserving batch covering frontend performance, code-quality
refactors, and pre-existing type-error cleanups. Type-check went from
**11 errors → 0** (2 benign pre-existing closure-capture warnings remain).
SSR-smoke-tested at desktop + mobile viewports across `/`, `/tonight`,
`/this-weekend`, `/letterboxd`, `/cinemas`, `/search` — all 200.

## Performance (10)

1. Cached `Intl.DateTimeFormat` instances at module scope in `utils.ts`
   (`formatTime`, `formatDate`, `toLondonDateStr`).
2. Decoupled `posthog-js` from the static-import graph: `posthog.ts` now
   `import type`s only and accepts the instance via `attachPostHog()` from
   the provider after a bounded-buffer of `track*` calls is replayed.
3. Removed redundant `upcoming` filter+sort in `DesktopHybridCard` and
   `MobileFilmRow` — parents pre-filter and pre-sort.
4. Replaced `dt.toLocaleString('en-GB', { hour, … })` in `buildFilmMap` with
   a cached formatter + `formatToParts`.
5. `compareFilmsByCalendarPriority` now consumes a pre-computed `earliestMs`
   instead of `new Date()` per comparison.
6. Removed `tailwind-merge` from the runtime — used only by `Badge.svelte`
   where `clsx` suffices.
7. Removed unused deps `date-fns`, `bits-ui`, `@formkit/auto-animate`,
   `svelte-maplibre` from `frontend/package.json`.
8. Emitted `<link rel="preload" as="image">` hints for the LCP poster on
   the homepage (desktop and mobile srcset variants, media-scoped).
9. Added explicit `width`/`height` attributes to the desktop poster `<img>`.
10. Rewrote homepage `dayGroups` as a single-pass `Map<date, Map<filmId, …>>`
    instead of two `groupBy` passes plus per-comparator `new Date()`.

## Refactor — code quality (10)

11. Renamed `state` → `pageState` in `letterboxd/+page.svelte` to stop
    colliding with the `$state` rune (resolves 7 svelte-check errors).
12. Fixed `CinemaMap.svelte` async `onMount` returning a cleanup wrapped
    in a `Promise` — `map.remove()` was **never called**, leaking a WebGL
    context on every nav. Now uses a sync `onMount` with a closure-captured
    map reference and a cancellation flag for the dynamic-import race.
13. Null-safe `ctx.session?.getToken()` in `SyncProvider.svelte`.
14. Null-safe `ctx.session?.getToken()` in `FollowButton.svelte`.
15. Extracted `CardFilm` / `CardScreening` types to
    `lib/components/calendar/card-shapes.ts` — replaces 3 inline duplicate
    interfaces across `FilmCard`, `DesktopHybridCard`, `MobileFilmRow`.
16. Dropped redundant past-filter + sort in `FilmCard.svelte` (parents
    now sort upstream).
17. Extracted `filmByline()` and `cardFilmMetaParts()` helpers — replaces
    4 duplicate `$derived.by` blocks across cards + film detail page.
18. Extracted `formatScreeningFormat()` — replaces identical
    `normalisedFormat` in two files.
19. Extracted `formatOrdinalDay()` — replaces inline 31-entry ordinal
    lookup table in the homepage `dayHeader` snippet.
20. Extracted `toCardScreening()` adapter — replaces 3 inline
    `.map()` closures (festivals page deliberately kept inline due to its
    different cinema-name fallback).

## Refactor — round 2 (10)

21. `preferences.svelte.ts`: DRY'd the three-times-repeated default
    preferences literal.
22. `film-status.svelte.ts`: Extracted `writeStatusLocally()` helper
    shared by `setStatus` (with server push) and `setStatusLocal` (without).
23. `recent-searches.svelte.ts`: Aligned to the standard
    `$effect.root(() => $effect(...))` auto-persist pattern. Previously the
    store used an imperative `persist()` call that would silently break if
    a future caller mutated `entries` outside the public API.
24. `Header.svelte`: Consolidated mobile + desktop nav into a single
    `NAV_ITEMS` array with `desktop`/`mobile` flags, replacing two
    hardcoded `<a>` lists that had drifted apart.
25. `Dropdown.svelte`: Scoped the document-level click-outside listener
    to when `open === true` via `$effect`. Previously each instance
    permanently attached a capture-phase listener — the homepage's four
    dropdowns kept four global listeners firing on every click.
26. `ActiveFilterChips.svelte`: `$derived` → `$derived.by` so `chips` is
    cached as an array, not a function the template re-invokes per render.
27. `cinemas/[slug]/+page.svelte`: Replaced `filter(new Date()...).sort(new
    Date()...)` with a decorate-sort-undecorate pattern using a single
    `Date.now()` anchor.
28. `film/[id]/+page.svelte`: Same decorate-sort-undecorate fix for
    `futureScreenings`.
29. `CalendarPopover.svelte`: Corrected the factually-wrong "initialise
    exactly once" comment on the `$effect` that actually re-syncs from
    `selected` on every change.
30. `today.svelte.ts`: Added a global de-dupe key so HMR re-evaluation
    can't stack `visibilitychange` listeners or midnight-tick timers.

## Round 2 (cont.)

31. `PostcodeInput.svelte`: Guard `onchange` so it only fires when the
    upper-cased value actually changed.
32. `api/client.ts`: Extracted `buildHeaders()` and `ensureOk()` helpers
    — `apiGet`/`Post`/`Put`/`Delete` no longer repeat header construction
    and ok-check logic four times. Standardised `RequestOpts` interface.
33. `server/api.ts`: Now throws the shared `ApiError` (with `status` and
    `body`) instead of a bare `Error`, matching the client.
34. `json-ld.ts`: Dropped the hard-coded fake `ratingCount: 1000` —
    omission is spec-valid and avoids a factually wrong SEO signal.
35. `json-ld.ts`: Extracted `absoluteUrl()` helper used by
    `breadcrumbSchema` and `itemListSchema`.
36. `utils.ts`: Added shared `padTwo()` and `toISODate()` date helpers,
    removing the duplicate inline `pad()`/`toISO()` in `CalendarPopover`
    and `MobileDatePicker`.
37. `utils.ts`: Added `useModalKeyboardTrap(onClose)` helper —
    `MobileFilterSheet` and `MobileDatePicker` both inlined identical
    Escape-handler + body-scroll-lock wiring; now both call the helper.
38. `area-clusters.ts` (new): Shared `AREA_CLUSTERS` constant and
    `cinemasInCluster` / `isAreaActive` / `toggleArea` helpers used by
    both `DesktopFilterSidebar` and `MobileFilterSheet`.
39. `DateTimePicker.svelte`: Reads "today" from the shared `today` store
    instead of `new Date()` inline; consolidates the two `new Date()`
    calls at module load to a single shared reference.
40. `DimmerDial.svelte`: Replaced the imperative `applyTheme(v)` call
    inside `setDimmer` with a reactive `$effect` keyed on `dimmerValue`,
    so a programmatic state change (testing, future feature flag, another
    component) propagates to the CSS custom properties.

## Impact

- **0 svelte-check errors** (was 11)
- **Removed deps**: `tailwind-merge`, `date-fns`, `bits-ui`,
  `@formkit/auto-animate`, `svelte-maplibre`
- **Bundle**: `posthog-js` is no longer in homepage card chunks
- **Memory leak fixed**: `CinemaMap` cleanup now runs on navigation
- **LCP**: Homepage poster preloaded with media-scoped srcset hints

## Files touched (frontend only)

```
frontend/package.json
frontend/vite.config.ts
frontend/src/lib/analytics/PostHogProvider.svelte
frontend/src/lib/analytics/posthog.ts
frontend/src/lib/api/client.ts
frontend/src/lib/calendar-filter.ts
frontend/src/lib/components/calendar/DesktopHybridCard.svelte
frontend/src/lib/components/calendar/FilmCard.svelte
frontend/src/lib/components/calendar/MobileFilmRow.svelte
frontend/src/lib/components/calendar/card-shapes.ts                 (new)
frontend/src/lib/components/festivals/FollowButton.svelte
frontend/src/lib/components/filters/ActiveFilterChips.svelte
frontend/src/lib/components/filters/CalendarPopover.svelte
frontend/src/lib/components/filters/DateTimePicker.svelte
frontend/src/lib/components/filters/DesktopFilterSidebar.svelte
frontend/src/lib/components/filters/MobileDatePicker.svelte
frontend/src/lib/components/filters/MobileFilterSheet.svelte
frontend/src/lib/components/filters/area-clusters.ts                (new)
frontend/src/lib/components/layout/Header.svelte
frontend/src/lib/components/map/CinemaMap.svelte
frontend/src/lib/components/reachable/PostcodeInput.svelte
frontend/src/lib/components/ui/Badge.svelte
frontend/src/lib/components/ui/DimmerDial.svelte
frontend/src/lib/components/ui/Dropdown.svelte
frontend/src/lib/seo/json-ld.ts
frontend/src/lib/server/api.ts
frontend/src/lib/stores/SyncProvider.svelte
frontend/src/lib/stores/film-status.svelte.ts
frontend/src/lib/stores/preferences.svelte.ts
frontend/src/lib/stores/recent-searches.svelte.ts
frontend/src/lib/stores/today.svelte.ts
frontend/src/lib/utils.ts
frontend/src/routes/+page.svelte
frontend/src/routes/cinemas/[slug]/+page.svelte
frontend/src/routes/film/[id]/+page.svelte
frontend/src/routes/letterboxd/+page.svelte
frontend/src/routes/this-weekend/+page.svelte
frontend/src/routes/tonight/+page.svelte
```
