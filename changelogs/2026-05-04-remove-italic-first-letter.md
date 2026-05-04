# Remove italic first-letter treatment from titles and headings

**PR**: TBD
**Date**: 2026-05-04

## Changes
- Removed the `italic-cap` / `title-italic-cap` "drop-cap-lite" pattern that styled the first character of titles, day mastheads, and section headings with `font-style: italic; font-weight: 400`.
- Edited 9 frontend components/pages:
  - `frontend/src/lib/components/calendar/DayMasthead.svelte` — day masthead ("Monday, the fourth"). The italic comma is preserved.
  - `frontend/src/lib/components/calendar/DesktopHybridCard.svelte` — desktop film card titles.
  - `frontend/src/lib/components/calendar/MobileFilmRow.svelte` — mobile film row titles.
  - `frontend/src/lib/components/filters/MobileFilterSheet.svelte` — "Filter" sheet heading.
  - `frontend/src/lib/components/filters/MobileDatePicker.svelte` — "Pick a date" heading + month name.
  - `frontend/src/lib/components/filters/CalendarPopover.svelte` — desktop month name.
  - `frontend/src/lib/components/film/FilmSimilarRail.svelte` — "If you like this".
  - `frontend/src/lib/components/film/FilmSidebar.svelte` — "Status" sidebar heading.
  - `frontend/src/routes/film/[id]/+page.svelte` — film title hero + "Showings" heading.
- Removed the `titleFirst` / `titleRest` derivations that existed solely to feed the italic-cap spans.
- Confirmed with `grep` that zero `italic-cap`, `title-italic-cap`, `titleFirst`, or `titleRest` references remain anywhere in `frontend/src/`.

## Impact
- Headings and titles render in a single, consistent weight throughout the app — no more standout italic glyph at the start of every title and heading.
- Day masthead reads as plain "Monday, the fourth" with only the comma retaining its small italic accent (intentionally preserved).
- Verified visually at desktop (1440×900) and mobile (390×844) viewports against the home page, mobile filter sheet, and mobile date picker. All four surfaces report `document.querySelectorAll('.italic-cap, .title-italic-cap').length === 0`.
- No behavioural changes — purely typographic. Pre-existing svelte-check errors in unrelated files (`FollowButton`, `CinemaMap`, `SyncProvider`, `letterboxd/+page`) are unaffected.
