# Close-Up day sweep planned from the programme index

**PR**: #778
**Date**: 2026-10-04

## Changes
- `planSweepDays` builds an explicit ascending day list. Range programmes add every day from the JSON's last day (or the range's first day, if later) to the range's end. One-day programmes add their day unless the JSON already names a show on it; on the JSON's own last day they are always added, since a truncated array could cut that day in half. Any day where the JSON lists a future show it cannot name is added too.
- `parseProgrammeSpan` reads heading spans: "22 October 2026", "3 - 31 October 2026", "28 September - 3 October 2026", December-to-January. Unrecognised prefixes and a start after its end are read as already running.
- `MAX_EMPTY_DAY_STREAK` applies only to the fallback walk used when the index is unreadable.
- Required/optional failures: a day from the JSON's last day to 14 calendar days later must succeed or the run fails. A day before the JSON's last day was fetched only to name an unnamed show, so its failure is logged and the run keeps the homepage JSON and every other page.
- `close-up.test.ts` (new) covers the plan, both live misses, range parsing, the JSON's last day, both sides of the required split, the fallback walk, and the three Cloudflare fast-fail paths.

## Impact
- 2026-10-04 live: 3 search requests (22 Oct, 31 Oct, 17 Nov); the old walk planned 18, made 6 before the streak stopped it and reached neither miss. 38 -> 40 validated screenings, last date 31 Oct -> 17 Nov. 22 Oct 20:15 BST stores as 19:15Z, 17 Nov 20:15 GMT as 20:15Z.
- Fewer requests means fewer chances to land in Close-Up's ~19-minute Cloudflare windows.
