# Homepage listings default to today (matches masthead)

**PR**: TBD
**Date**: 2026-04-25

## Changes
- `frontend/src/routes/+page.svelte` — `filmMap` derivation now treats `filters.dateFrom`/`filters.dateTo` of `null` as "today" (London civil date) so the listings rendered under each poster on the homepage match the date implicit in the day masthead. The existing logic short-circuited the date filter entirely when no range was set, leaking the full 30-day payload from `/+page.server.ts` into the grid.
- Date comparison now uses `toLondonDateStr(s.datetime)` instead of `s.datetime.split('T')[0]`. The previous form took the **UTC** date portion of the ISO string, which disagrees with the London-time `dateFrom`/`dateTo` strings produced by `setDatePreset` and `selectDate`. For BST overnight screenings (e.g. 00:30 London = 23:30 UTC the previous day) this caused off-by-one date filtering — a screening that London considers "tomorrow" was excluded when "tomorrow" was selected.

## Why
The day masthead derives `activeDate = filters.dateFrom ?? today` and renders a single-day headline ("Saturday, the twenty-fifth"). Users on the desktop hybrid grid saw that single-day headline above a film card whose three "next showings" actually spanned multiple future days, because the underlying derived state silently skipped the date filter when nothing was selected. This mismatch is the bug the user reported: "the listings underneath each poster show ones that are not on this date but just all the listings."

## Verification
- Local Playwright run on `http://localhost:5173/` (1440×900): all 190 desktop screening times rendered carry a London-time `datetime` of 2026-04-25 (today) before any interaction. After clicking the next-day strip button, all 116 visible times shift to 2026-04-26.
- Mobile (390×844): the mobile day-section list now contains a single section with today's date; previously it included sections for every day in the next 30.
- The "Pick date opens calendar popover" homepage test failed before this change too — confirmed pre-existing flakiness, not a regression.

## Impact
- **Users**: the homepage now shows the same day on the masthead, the day strip, the desktop grid, and the mobile day list — they all agree.
- **No API change**: `/+page.server.ts` still loads the 30-day window, so navigating future days via the strip remains instant (no extra fetch).
- **No store change**: `filters.dateFrom`/`dateTo` stay nullable; "Today" still resolves to `null`. Multi-day presets (`weekend`, `7days`) and explicit Pick-date ranges are unaffected.

## Files
- `frontend/src/routes/+page.svelte`
