# Frontend dead code and two unused dependencies removed

**PR**: #794
**Date**: 2026-10-04

## Changes
- Deleted 11 frontend files that nothing imported: `DesktopHybridCard`, `MobileFilmRow` and `DayMasthead` (calendar), the `ScreeningRow`, `RecentRow` and `UserStatusRow` palette rows, `stores/recent-searches.svelte.ts`, `stores/media.svelte.ts`, the `stores/palette.test.ts` stub, `lib/index.ts` and the scaffold `lib/assets/favicon.svg`.
- Command palette: dropped the `recent`, `screening` and `user-status` result kinds, which no code ever produced, with their `ResultsList` branches and `activate()` cases. `ResultsList` now builds its sections in one pass. The store loses `triggerSource`, `serverError`, `setResults`, `_setNowTick`, `_disposePaletteStore` and the 60-second `nowTick` interval; `parsed` reads the clock on each query change, and the query is cleared on every close. `activate()` maps a row to its path and navigates once, replacing five identical branches.
- Stores: removed the filters undo snapshot, `hideSeen`, `hideNotInterested`, `showSoldOut` and `activeFilterCount`; the user-location `error` and `clear()`; the film-status `all` and `wantToSeeCount` getters (`writeStatusLocally` is inlined into `setStatus`); the reachable `clear()`; the today store's HMR guard.
- Search parser: removed `freeText` and the token `raw`/`start`/`end` fields (no production reader), the `compilePhrases` WeakMap memo, and seven date helpers in favour of one `setDays` helper plus `nextWeekday`. Hour chips use `formatHour` from `constants/filters`. The format, genre and time phrase tables are derived from their maps, which drops the two hyphenated format phrases that could never match. The filter-action row id is the constant `"apply"`.
- Reuse: `formatTime` replaces the private formatters in `DeadlinePicker` and `ReachableResults`, `londonClock` replaces `getLondonHour` in `calendar-filter.ts`, `formatLabel` replaces `formatScreeningFormat` on the film page, Svelte's `MediaQuery` replaces the media store in `CommandPalette`, and `Badge` passes a native class array.
- Removed unused props and exports: `Header` `cinemas`/`showFilters`, `FilmCard`/`FigmaFilmCard` `activeCinemaIds`/`maxScreenings`, `Dropdown` `role`/`triggerEl`, `CommandPaletteInput` `placeholder`, `Badge` `accent`/`class`, `CardFilm` `country`/`certification`/`tmdbId`, `FilmSidebar` `id`/`title`/`year`/`genres`, `isAreaActive`/`toggleArea`, `screeningEventSchema`, `itemListSchema`, `trackCalendarExport`, `isFeatureEnabled`, `getLocationName`, `formatTimeRange`, `TimeOfDay`, `UserFilmStatus`, `DataSourceType`, `padTwo`, `cardFilmMetaParts`, `formatOrdinalDay` and `API_BASE`.
- Small shrinks: `DimmerDial` keys its colour tables by CSS property and loops; `MobileFilterSheet` shares one all-selected check and one toggle between area chips and "within 2 miles"; `ReachableResults` names its urgency classes after the urgency value; the duplicate `.sr-only` in `CommandPalette` goes (app.css has it).
- Uninstalled `clsx` and `@sveltejs/adapter-auto` from `frontend/package.json` and removed the adapter-auto scaffold comment in `svelte.config.js`.

## Impact
- Visitors see the same site. svelte-check reports 0 errors, frontend vitest passes 89 tests, the production build succeeds, Playwright E2E fails only the 18 known baseline tests, and before/after screenshots of `/`, `/tonight`, a film page and the cmd+K palette at 1440x900 and 390x844 are byte-identical.
- The frontend source is about 2,050 lines smaller and has two fewer direct dependencies.
- An open palette now resolves "tonight" against the time of the last keystroke. Before, a 60-second tick also refreshed it while the query sat unchanged.
