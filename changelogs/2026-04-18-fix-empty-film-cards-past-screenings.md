# Hide past screenings on calendar pages (no empty film cards)

**PR**: TBD
**Date**: 2026-04-18

## Changes
- `frontend/src/routes/+page.svelte` — in the `filmMap` derived loop, skip any screening whose `datetime <= Date.now()`
- `frontend/src/routes/tonight/+page.svelte` — same filter added to the film grouping loop
- `frontend/src/routes/this-weekend/+page.svelte` — same filter added before day-grouping

## Bug
Users reported film cards rendering with a poster + title + metadata but zero screening pills. Example: `SIRĀT` on the main calendar at 16:50 — its only screening for today was at 14:00, already past.

## Root cause
All three calendar pages are ISR-cached on Vercel:
- `/` → 3600s
- `/tonight` → 900s
- `/this-weekend` → 3600s

The server-side API call filters by cache creation time, not the user's "now". A screening scheduled for 14:00 was upcoming when the page was built at 13:45, so it made it into the ISR response — but by 16:50 the user sees a stale, past screening.

`FilmCard` internally filters `new Date(sc.datetime) > new Date()`, which drops the past pill but still renders the card shell — leading to the poster-without-pills bug.

## Fix
Move the past-screening filter one level up into each page's derived grouping. If a film has no future screenings left, it disappears from the day-group entirely instead of reserving an empty grid slot.

## Impact
- Home calendar, tonight, and this-weekend all stop showing empty cards
- Zero backend changes; no scraper or schema impact
- Re-computes on every Svelte 5 `$derived` invalidation — the cost is negligible compared to ISR revalidation
