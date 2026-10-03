# Homepage STARTING SOON strip

**PR**: #762
**Date**: 2026-10-03

## Changes
- A STARTING SOON strip now sits above the first day on the homepage. It lists the next 6 screenings that start within 3 hours, soonest first, across all films, with the toolbar's filters applied.
- It reuses the TEXT-mode timetable (`FigmaTextDay`) under a black day-header bar, and its rows link to booking the same way TEXT rows do.
- `selectStartingSoon()` in `frontend/src/lib/calendar-filter.ts` picks the rows and has unit tests. Start-time ties break by screening id, compared by code unit, so the ISR-rendered HTML and the first client render order rows identically (the #736 hydration hazard). `localeCompare` would follow each side's locale, and Danish collation reorders UUIDs.
- The strip hides in TEXT mode, which is already sorted by time, and whenever nothing starts within the window: late at night, or with TOMORROW selected.
- It keeps its own clock, ticking every minute and when the tab becomes visible again. Booking links open in a new tab, so people come back to an old homepage tab, and the rest of the page reads the clock only once, at hydration.
- It lives in its own `section.soon`, so `section.day` still means one calendar day to the tests and to `fitToFirstRow`. It shares the day sections' width ladder: its edges line up with the card grid when the first day fills a row, and a short first day (late at night, or a one-cinema filter) leaves it wider than the cards.
- `FigmaTextDay` takes optional `label` and `source` props. Screen readers hear the strip's table as "Screenings starting soon", and its clicks reach PostHog as `source: 'calendar-soon'`.
- TEXT mode and the strip share one mapping, `toTextDayFilm`, in `+page.svelte`.
- E2E tests cover the strip's order, size, window and TEXT-mode toggle on desktop, and check that a phone sees its first time without scrolling. Both retry until hydration settles, so they hold against ISR-served targets.

## Impact
- On a 1440x900 screen the first showtime moves from about 895px to 452px down the page. On a 390x844 phone it moves from about 940px to 476px, so a phone visitor sees a time before reaching the first poster.
- Cards keep their Letterboxd-rating order and their design. The strip is a second, time-first way in.
- When cached HTML is up to an hour old, hydration can swap the strip's rows, and late in the evening the strip can change height. The grid below already drops expired cards in the same situation. A shorter homepage ISR window would reduce both.
- Comes from the 2026-10-03 Impeccable critique of the homepage (21/40), priority issue 1.
