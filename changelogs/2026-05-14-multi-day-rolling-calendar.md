# Multi-day rolling calendar — always show upcoming films

**PR**: TBD
**Date**: 2026-05-14

## Problem

The homepage at `pictures.london` defaulted to a single-day view (today's screenings only). The `buildFilmMap` helper in `frontend/src/lib/calendar-filter.ts` defaulted both `effectiveFrom` and `effectiveTo` to `today` when no date filter was set. After ~11pm, when all of today's screenings had already started (`dtMs <= now` excluded them), the page rendered zero films and showed the "No screenings found" empty state — a dead-end for users browsing late at night.

## Changes

### `frontend/src/lib/calendar-filter.ts`
- Default `effectiveTo` is now `'9999-12-31'` (unbounded forward) when `filters.dateTo` is null, instead of `today`. The behavioural-contract docstring is updated accordingly.
- The dev-only one-sided-range warning is relaxed: a `dateFrom`-only range is now valid (it's how the day strip anchors the rolling window). The warning only fires when `dateTo` is set without `dateFrom` — an unusual configuration no current UI surface produces.

### `frontend/src/routes/+page.svelte`
- New `visibleDayGroups` derived value that slices the full `dayGroups` array until total film count ≥ 24 (`MIN_FILMS_VISIBLE`), capped at 7 days (`MAX_DAYS_VISIBLE`). This produces a rolling window that auto-extends in sparse periods (late night) and collapses to roughly one day during peak hours.
- Desktop layout: the flat `hybridFilms` grid is replaced with per-day `<section class="desktop-day">` blocks. Each day renders a `dayHeader` snippet followed by `DesktopHybridCard`s. The `hybridFilms` derivation is removed.
- Mobile layout: the global `.mobile-date-label` block at the top of the mobile header is removed. Each `<section class="mobile-day">` now renders its own `dayHeader` snippet inside.
- New `{#snippet dayHeader(iso: string)}` shared between desktop and mobile. Labels the day with "Today" / "Tomorrow" + weekday + ordinal (e.g. "Tomorrow · Friday, the fifteenth"). Reads from `todayStore` so it advances at the midnight rollover.
- New `.desktop-day` and `.day-header` styles. Desktop day-header is 28px serif italic with a bottom border; mobile is 22px.

### `frontend/src/lib/components/calendar/DayMasthead.svelte`
- `selectDate(iso)` now sets `filters.dateFrom = iso` and leaves `filters.dateTo = null` (anchors the rolling window from that day forward) instead of setting both ends to `iso`. Clicking "Today" still clears both, restoring the default rolling window.

### Tests
- `frontend/test-all.spec.ts`: the "listings default to today" test is rewritten as "listings default to a rolling multi-day window from today onwards". The invariant now asserts no past screenings leak (rather than no future-day screenings appearing) and that clicking the next-day strip moves the earliest visible date forward (rather than narrowing to one day).
- `frontend/tests/mobile.spec.ts`: the "day label renders" test now reads from the first `section.mobile-day h2.day-header` since the global `.mobile-date-label` no longer exists.

## Impact

- **Users**: Late-night visitors (after ~11pm London) now see tomorrow's screenings underneath the masthead instead of an empty state. Day-by-day browsing is more discoverable; the day strip now extends the window forward rather than narrowing it.
- **Letterboxd-rating sort**: still applied within each day. Films users will recognise (highly-rated) appear first per day, just as they did in the old flat grid.
- **Performance**: no additional network calls — the server-side load already fetches a 14-day window. The slice is purely client-side derived state.
- **Behavioural contract**: `buildFilmMap`'s default range is now `[today, ∞)` instead of `[today, today]`. Any future caller relying on the old single-day default must explicitly set `dateTo`.

## Verification

- Type-check (`npx svelte-check`): clean for all modified files; pre-existing errors in `src/routes/letterboxd/+page.svelte` are untouched.
- Playwright (`npx playwright test --project=chromium`): the two homepage tests this change touches pass. Remaining 9 chromium failures are pre-existing dev-environment issues (film detail pages return 404 in local dev; mobile-iPhone tests need webkit installed) — confirmed unrelated by reproducing on main.
- Manual browser verification (Playwright automation): desktop 1440px, mobile iPhone 12 Pro 390x844, late-night `page.clock` simulation, day-strip navigation, empty-state filtering. Screenshots in `/tmp/multiday-screenshots/` during development.
