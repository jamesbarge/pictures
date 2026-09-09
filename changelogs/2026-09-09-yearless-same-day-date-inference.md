# Yearless same-day dates were inferred a year ahead

**PR**: pending
**Date**: 2026-09-09
**Base**: `f9725cd683f6741caf64c6cfd2d7b918abb0bf35`

## Root cause

`parseScreeningDate()` resolved a yearless listing ("Wednesday 9th September") by comparing the
**reference instant** against the parsed day's **UTC midnight**:

```ts
if (!yearMatch && isAfter(referenceDate, parsed)) parsed = addYears(parsed, 1);
```

Today's UTC midnight is behind "now" for the whole of today, so from 00:00 onwards today looked
past and was pushed into next year. Reproduced on the base commit at reference
`2026-09-09T16:00:00Z`:

| input | before | after |
|---|---|---|
| `Wednesday 9th September` (today) | **2027**-09-09 | 2026-09-09 |
| `Thursday 10th September` (tomorrow) | 2026-09-10 | 2026-09-10 |
| `Thursday 31st December` at 2026-12-31T20:00Z | **2027**-12-31 | 2026-12-31 |

Because `MAX_DAYS_IN_FUTURE = 90` for text-sourced times, the mis-inferred rows were then rejected
as `too_far_future` — today's screenings silently disappeared rather than appearing at a wrong date.

The default year also came from `referenceDate.getFullYear()`, which is host-timezone dependent.

## Changes

- `src/scrapers/utils/date-parser.ts`: compare **calendar days in Europe/London** via the existing
  `londonParts()`, using a small order-only `isBeforeLondonDay()` helper. The default year now comes
  from the London day too, resolved lazily so an explicit year never consults the reference at all
  (`londonParts()` throws on an invalid Date).
- **Second host-TZ defect found in review and fixed in the same change:** the rollover used
  `date-fns addYears()`, which works in **local** time. Under `TZ=Europe/London`,
  `addYears(2026-03-29T00:00Z, 1)` returns `2027-03-28T23:00Z` — and `combineDateAndTime()` reads UTC
  components, so a rolled 29 March screening landed on **28 March**. Rollover is now UTC calendar
  arithmetic, clamped to the last day of the target month so date-fns' leap behaviour is preserved
  (a real 2028-02-29 still rolls to 2029-02-**28**, not into March). The `date-fns` import is gone.
- `src/scrapers/utils/date-parser.test.ts`: 13 regression cases — same-day before/after performance
  time and late evening, London-vs-UTC day boundary, tomorrow, genuinely-past rollover, ordinary
  future dates, year-end (NYE and 1 Jan), leap day in and out of a leap year, explicit-year override.
- `src/scrapers/cinemas/prince-charles-capture-replay.test.ts` + fixture
  `src/scrapers/utils/fixtures/pcc-whats-on-2026-09-09.html`: replays a byte-for-byte slice of a real
  PCC capture through the **real scraper**, clock pinned to the capture instant, network mocked, DB
  mocked. Asserts exact London/UTC instants, not counts.

## Deliberately unchanged

- The "past date without a year means next year" contract for genuinely earlier days.
- Meridiem policy (`parseScreeningTime`'s 1-9 → PM assumption) and the horizon constants.
- `Date.UTC` overflow for an already-invalid 29 February in a non-leap year (it becomes 1 March
  before any rollover) — pinned by a test, and kept distinct from the valid-leap-day clamp above.
- Parsing stays separate from past-screening filtering; no stale date is presented as future.

## Verification

| command | exit | result |
|---|---|---|
| `TZ=UTC npx vitest run src/scrapers/` | 0 | 718 passed |
| `TZ=Europe/London npx vitest run src/scrapers/` | 0 | 718 passed |
| `npm run test:run` | 0 | 2112 passed, 140 files |
| `npx tsc --noEmit` | 0 | no output |
| `npm run lint` | 0 | 61 warnings, 0 errors — same count as base, none in changed files |

Both new suites were confirmed **red before the fix and green after**; the replay was re-run against
the unfixed parser to prove it is a real regression test rather than a self-comparison.

**Pre-existing failure, unrelated and not fixed here:** `parseDateTime > should parse ISO datetime`
fails under `TZ=America/Los_Angeles` (`expected 23 to be 22`). Verified identical on base
`f9725cd6`; it is the TZ-less `new Date(dateTimeStr)` fallback, outside this task's scope.

## Impact

Affects every scraper whose source omits the year and routes through `parseScreeningDate()` —
Prince Charles, Barbican, Phoenix, ICA, David Lean, Olympic, Bertha DocHouse and Ciné Lumière among
them. On any run, that day's yearless listings were resolved a year out and dropped by the horizon.

**No production repair is claimed from these offline tests.** Whether existing rows carry
mis-inferred future dates is a separate question; any cleanup should be raised as a reviewed,
targeted preview. **No early screenings should be deleted as part of it.**
