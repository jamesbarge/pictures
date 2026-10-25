# Remove the homepage STARTING SOON strip

**PR**: #845
**Date**: 2026-10-25

## Changes
- The STARTING SOON strip added in #762 is gone from the homepage, which opens on the first day of poster cards again.
- `+page.svelte` loses the strip's markup, its 3-hour window and 6-row limit, its once-a-minute clock, and its `.soon` CSS. The day sections keep the same width ladder.
- `toTextDayFilm` stays in `+page.svelte` as the TEXT-mode mapping, now with a single caller.
- `FigmaTextDay` drops the `until`, `limit`, `label` and `source` props, which only the strip set. TEXT mode renders as before: the table is still named "Screenings list" and row clicks still reach PostHog as `source: 'calendar-text'`.
- `calendar-soon` leaves the `DiscoverySource` type. Events already recorded with that source stay in PostHog.
- The strip's two E2E tests (desktop order and window, iPhone first-screen time) are removed.

## Impact
- Homepage visitors see poster cards first. By #762's measurements, on the pre-sidebar page, the first showtime moved back to about 895px down a 1440x900 screen and about 940px down a 390x844 phone.
- TEXT mode, the card grid and the other routes are unchanged.
- Reconciled with #846, which merged first and left the strip in place on the new sidebar layout. The strip, its clock and its `.soon` CSS come off that layout. #846 rewrote the strip's E2E tests onto the View radio; those tests are dropped here.
