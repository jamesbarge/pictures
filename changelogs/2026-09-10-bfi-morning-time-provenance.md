# BFI IMAX morning screenings: separate "unambiguous clock" from "longer horizon"

**Scope: BFI IMAX only.** `mapRows` is shared by both BFI venues; only IMAX's
clock format was captured, so **Southbank is unchanged and still fully strict**.

**PR**: (pending)
**Date**: 2026-09-10

## The loss

The 2026-09-09 run found 91 BFI IMAX rows and rejected **12** — every one "The
Odyssey" at hour 9 — as `suspicious_time_early`. `Total: 91 | Valid: 79 |
Rejected: 12` (`scrape-full-20260909-221554.log:6845-6857`).

## Establishing the source format first

`mapRows` reads AudienceView's embedded `searchResults`: column **[8]** is the
clock, [9]/[10]/[11] are day / 0-indexed month / year, fed to `ukLocalToUTC`
with **no PM heuristic**. So the question was whether [8] is genuinely 24-hour.

A bounded read-only capture on 2026-09-10 (HTTP 200, full-page sha256 in
`src/scrapers/cinemas/__fixtures__/bfi/PROVENANCE.json`) settles it. Hour
histogram across all 91 rows:

```
{9:12, 10:6, 11:3, 13:13, 14:8, 15:1, 17:17, 18:5, 19:2, 20:19, 21:2, 22:1, 23:2}
```

Hours run to **23**, so a 12-hour clock is excluded. Sub-ten values are written
`09:00`, never `9:00`. No am/pm text appears in the column. Column [7]
corroborates: `"Saturday 12 September 2026 09:00"`. **`09:00` at this source is
unambiguously morning** in this capture. This supports the inference that the previous
run's early-time rejections were false positives; it does not establish those historical rows.

**Scope limit:** this fixes the source's *format*, a stable property of the
feed. It does **not** establish the contents of the 2026-09-09 run, so it cannot
prove which 12 records were rejected that day.

## The policy boundary, and why a third value

`timeSource: "iso"` was doing two unrelated jobs:

1. keep sub-10:00 times (an ISO instant cannot carry an AM/PM error), and
2. raise `too_far_future` from 90 to 180 days (chains' API feeds carry long-lead
   event cinema).

Labelling BFI `"iso"` would have bought (1) and silently taken (2) — doubling
BFI's date horizon on no evidence at all. So the two questions are now separated.

`RawScreening.timeSource` gains **`"local-24h"`**: a machine-readable *local
wall clock* in an established 24-hour format.

| timeSource | sub-10:00 | future cap |
|---|---|---|
| `"iso"` | kept with warning | **180 days** |
| `"local-24h"` | kept with warning | **90 days** |
| `"text"` / unset | **rejected** | 90 days |

Clock format is evidence about AM/PM ambiguity. It is not evidence about how far
ahead a venue publishes. The validator now keys the horizon on `isoSourced`
alone and says so in a comment.

## Changes

- `src/scrapers/types.ts` — `timeSource?: "iso" | "text" | "local-24h"`, with
  each value's two effects documented.
- `src/scrapers/utils/screening-validator.ts` — `clockIsUnambiguous`
  (`iso || local-24h`) gates the early-hour rule; `isoSourced` alone still gates
  the horizon.
- `src/scrapers/cinemas/bfi.ts` — the **structured** clock path sets
  `timeSource: "local-24h"` behind two gates, and the display-text fallback sets
  nothing:
  - **per-venue** `clockFormatVerified`, set for **IMAX only**. `mapRows` is
    shared by both venues; two bounded Southbank captures on 2026-09-10 were
    served Cloudflare (HTTP 403, "Just a moment...", no `searchResults`), so
    Southbank's format is unverified and it keeps full strictness.
  - **per-field** `isUnambiguous24hClock()`, anchored and range-checked
    (`^([01]\d|2[0-3]):([0-5]\d)$`). The existing parse regex
    `^(\d{1,2}):(\d{2})` is unanchored and range-free, so it also matches
    `"09:00 PM"` (really 21:00) and `"29:99"`. Provenance must not rest on it.
    The parse itself is unchanged — this decides provenance only.

**Not changed:** the shared date-parser, the 1-9 PM heuristic, the datetime
parse itself, BFI Southbank, any other venue, any horizon, and no data was
repaired, backfilled or deleted.

## Tests

`src/scrapers/cinemas/bfi-time-provenance.test.ts`, 13 cases driving the real
**production** `mapRows` → `validateScreenings` seam against the captured rows:

- the 09:xx rows are mapped, carry `local-24h`, and **are not** `iso`
- they survive validation and appear as warnings rather than rejections
- **a 120-day-out `local-24h` screening is still rejected** — BFI's horizon
  stays 90 — while `iso` at 120 days is still accepted
- a 09:00 `text` screening, and one with no `timeSource`, are still rejected
- BST 09:00 → `08:00Z`; GMT 09:00 → `09:00Z`
- a malformed clock does not earn `local-24h`; an unparseable row is skipped

Plus, after review: 14 cases on the strict clock gate (`"09:00 PM"`, `"09:00pm"`,
`"9:00"`, `"29:99"`, `"24:00"`, `"09:60"`, `"09:00:00"`, trailing prose, empty —
all refused; `"00:00"`/`"09:00"`/`"23:59"` accepted), two driving production
`mapRows` to show suffixed and impossible clocks earn no provenance (the suffixed-clock
case also asserts downstream rejection), and two pinning that Southbank gets no provenance while the
identical IMAX row does. **31 tests total.**

Three of the original 13 were verified to fail before the change. Reverting the
strict gate to the loose prefix regex fails **10** of the 31, so the gate bites.

## Verification

Earlier targeted run on validator + BFI + INDY: 45 passed, exit 0, before the additional review cases.
Final `npm run test:run -- --maxWorkers=2`: 145 files / 2193 tests passed, exit 0.
Final BFI-focused runs under both `TZ=UTC` and `TZ=Europe/London`: 31/31 passed in each,
exit 0; independently repeated by the code reviewer. The first UTC review run failed two
test fixtures because they used runtime-local `setHours`; the fixtures now use `ukLocalToUTC`.
`npx tsc --noEmit`: exit 0. `npm run lint`: exit 0 (61 pre-existing warnings, 0 errors).
