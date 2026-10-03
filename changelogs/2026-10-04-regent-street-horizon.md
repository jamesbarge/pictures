# Regent Street INDY horizon raised to 120 days

**PR**: TBD
**Date**: 2026-10-04

## Changes
- `REGENT_STREET_VENUE` sets `horizonDays: 120` and is exported for its new wiring test. Before, it fell back to `DEFAULT_HORIZON_DAYS = 35` in `src/scrapers/platforms/indy.ts`.
- `regent-street.test.ts` pins the venue ids, the horizon, and that a showing 48 days out (21 Nov) is requested and kept.
- The playbook's INDY section records Regent Street at 120 and corrects Chiswick's documented horizon to the 200 the code uses.

## Impact
- The 2026-10-04 horizon audit found kept showings to day offset 48. Dry parse that day: 27 -> 33 showings. Recovered: the Strawbs documentary + Q&A (8 Nov), three London Baltic Film Festival premieres (13, 20, 21 Nov), 42nd Street (16 Nov) and Ulya (21 Nov). None before 10:00 London.
- About 85 extra `showingsForDate` POSTs per run at 250ms pacing, mostly empty. Showings past day 90 pass validation because INDY sets `timeSource: "iso"` (180-day cap).
