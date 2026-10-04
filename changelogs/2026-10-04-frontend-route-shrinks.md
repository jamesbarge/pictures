# Frontend routes share their screening, CSS and test helpers

**PR**: #PENDING
**Date**: 2026-10-04

## Changes
- `frontend/src/lib/server/api.ts` gains `ApiScreening` and `slimScreening`. Home, tonight and this-weekend trim `/api/screenings` rows through it; home adds `genres` on top, as before, and tonight/this-weekend still ship without it. The three copies of the 20-line mapping and the response interface are gone.
- `map/+page.server.ts` and `reachable/+page.server.ts` stop fetching `/api/cinemas` and read the root layout's cinema rows. `CinemaMap.svelte` and `reachableStore.calculateTravelTimes` now type only the fields they read (id, name, area, coordinates). Each render of `/map` and `/reachable` makes one fewer upstream call. The ISR config and cache headers stay as they were.
- `reachable/+page.svelte` uses the server's screening rows directly in place of an identical re-map.
- Home reads `cinemas` from its typed `data` prop (the `$app/state` cast is gone); directors drops its duplicate `DirectorEntry` type; film detail loses an `if (browser)` guard inside `onMount`; tonight and this-weekend stop returning `dateLabel`, `startDate` and `endDate`, which no page read.
- Response types in home, festivals, cinemas/[slug] and the root layout list only the fields each load maps.
- Film detail and cinema detail sort upcoming screenings with one `filter` and `sort` over `Date.parse`. The film page's two Save buttons are one button with a computed label and `aria-pressed`. Watchlist renders both lists from one `row` snippet.
- `sitemap.xml/+server.ts` fetches `/api/films/search?browse=true` directly. The `/api/films/sitemap` endpoint was never built and returned 400 on every render, so `toLastmod`, `FilmRef` and the `lastmod` field never emitted anything. `safe()` became `.catch()` at each call site, and the default `prerender = false` export is gone.
- `app.css` drops the `--spacing-*` scale (every value equalled Tailwind's default), six unused `--font-size-*` sizes and their mobile overrides, five unused `--radius-*` values, `--duration-instant`, `--duration-slower`, `--ease-snap`, `.brutal-card`, `.brutal-card-sm`, `.font-display`, `.font-serif`, `.font-serif-italic`, `.font-mono-plex`, `.tracking-swiss`, the duplicate `'Inter'` @font-face and the `.sr-only` copy that Tailwind generates for the same class. It adds one global `.prose` (about, privacy, terms) and one global `.poster-grid` (tonight, this-weekend, festival detail), replacing six scoped copies.
- Deleted `frontend/static/fonts/{Cormorant-Italic,Fraunces,IBMPlexMono,IBMPlexMono-500}.woff2` (188 KB), which nothing has referenced since the Spline redesign.
- Deleted `frontend/src/app.d.ts` (every interface was commented out), the vitest `$app` alias that pointed at a missing directory, and the `dns-prefetch` beside the `preconnect` for image.tmdb.org.
- Tests: `dismissConsent` lives once in `tests/base-url.ts` for four specs; `mobile.spec.ts` has an `expectNoOverflow` helper with one loop per viewport; `command-palette.spec.ts` loads the page in its `beforeEach`; 11 redundant `setViewportSize` calls are gone from `test-all.spec.ts`.
- Tests removed per Playwright project (14): seven standalone page-title tests folded into a sibling that already loads the page (home, film detail, tonight, cinemas, directors, watchlist, settings); the duplicate "clicking wordmark navigates to home" and "loads map page with heading"; the two 404 tests merged into one; "Filter button opens mobile filter sheet dialog" and "hamburger menu button is visible", which later tests already cover; and the two `test.fixme` cinema-overflow tests, skipped since #432.

## Impact
- Visitors see the same pages. Screenshots of `/`, `/tonight`, `/this-weekend`, `/about`, `/festivals/lkff-2026`, `/map` and `/reachable` at 1440x900 and 390x844 match main pixel for pixel, as do the film page, the watchlist and all 65 map popups.
- The film page's Save button keeps keyboard focus after toggling, where the old pair of buttons swapped the element and dropped focus.
- `/sitemap.xml` is byte-identical to main (186,071 bytes, 1,253 URLs, 200 film URLs).
- `/map` and `/reachable` each make one fewer `/api/cinemas` request per render, and the sitemap stops making a failing request on every render.
- The Playwright suite lists 198 tests across both projects, down from 226.
- The cinemas grid still overflows at phone widths; the two deleted `test.fixme` tests tracked it, and it needs a Linear issue.
