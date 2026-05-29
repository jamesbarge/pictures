# Lazy-mount MobileFilterSheet on the home route instead of always instantiating it (+1 related bundle fixes)

**PR**: perf campaign
**Date**: 2026-05-29

## Changes
- `frontend/src/routes/+page.svelte`: replaced the static `import MobileFilterSheet` with a
  `$state` holder (`null` until first open) mirroring the existing `FilmSimilarRail` lazy pattern.
  The mobile Filter button's `onclick` now dynamically `import()`s the component (once) alongside
  setting `mobileFilterOpen = true`, and the sheet is rendered behind an `{#if MobileFilterSheet}`
  guard. The sheet's `cinemas`/`filmCount`/`open`/`onClose` props and its internal modal
  keyboard-trap `$effect` are unchanged.
- `frontend/src/routes/+page.svelte`: hoisted the two per-day `Intl.DateTimeFormat` builders
  (`weekday: 'long'` and `day: 'numeric'`, both `en-GB` / `Europe/London`) out of the
  `{#snippet dayHeader}` into module-script-top constants (`dayHeaderWeekdayFmt`,
  `dayHeaderDayNumFmt`). The snippet now calls `.format()` on the hoisted instances. The
  `tomorrowIso`/`relative` logic is left unchanged.

## Impact
- Affects the home route (`/`) client bundle and first-paint hydration.
- Bundle KB / hydration ms: ~725 lines of mobile filter UI (MobileFilterSheet + MobileDatePicker
  + area-clusters + user-location store) no longer ship in the home route node chunk. Verified in
  the build output: on `origin/main` the filter-sheet code (`AREA_CLUSTERS`, `Within 2 miles`,
  `datePickerOpen`) is bundled directly into the home page node chunk and loaded on first paint;
  on this branch it is moved into a separate chunk loaded only via a dynamic `import()` on first
  Filter tap. On the desktop default shell (>=1024px) the sheet code path now never loads.
- INP / re-render cost: removes 2 `Intl.DateTimeFormat` constructions per visible day header
  (up to 14 per filter-change re-render across the up-to-7-day window); the constructor's
  ICU locale/timezone load now happens once at module load.

## Behavior preservation
Rendered DOM is byte-identical: the closed sheet emits no DOM either way (it already has an
internal `{#if open}` guard, and `mobileFilterOpen` starts `false`), and the hoisted formatters
use constant configs so the day-header text is unchanged. Acceptance: Playwright iPhone 12 Pro
(390x844) asserts no `.mobile-filter` sheet DOM initially, the sheet opens with identical content
on Filter tap (presets, area clusters, Within 2 miles, film count) with Escape/scroll-lock intact;
at desktop 1280px the sheet chunk never loads; each day header still reads e.g.
"Today · Thursday, the twenty-ninth" identically before/after.
