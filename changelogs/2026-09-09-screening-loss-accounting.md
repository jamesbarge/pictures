# Honest screening-loss accounting

**PR**: #752
**Date**: 2026-09-09
**Base**: `f9725cd683f6741caf64c6cfd2d7b918abb0bf35` (`origin/main`, #749)

## The problem

A scrape reported three numbers — `added`, `updated`, `failed` — and two of them did
not mean what they said.

- `BaseScraper.validate()` dropped candidates before the pipeline counted anything,
  with no reason and no total. Nothing downstream could say how much of what a venue
  published was kept.
- `insertScreening` returned a bare boolean. `true` meant "the
  `INSERT ... ON CONFLICT DO UPDATE` statement ran", which is an insert *or* an
  update, and it was counted `added`. `false` meant either "an existing row was
  updated in place" or "the duplicate check said skip", and both were counted
  `updated`.

So `added` was not an insert count, `updated` was not an update count, and the loss
between what a venue published and what we stored was invisible.

## Changes

### A counted unit and named stage boundaries

`src/scrapers/utils/screening-accounting.ts` (new) defines the unit as one
`RawScreening` candidate at every stage except fetch, whose unit is a payload, and
the boundaries `fetch → parse → pre-filter → validate → accept → write → post-write`.
`checkAccounting` verifies the conservation equation at each one.

`CountOrUnavailable = number | "unavailable"` makes an unmeasured count a first-class
value. Conservation is **skipped rather than failed** when an input is unavailable: an
unknown count cannot disprove conservation, and failing on it would push callers back
to fabricating zeros.

### Pre-filter reason codes

`BaseScraper.validate()` now tallies why each candidate was dropped
(`missing_title`, `invalid_datetime`, `past_screening`, `missing_booking_url`,
`duplicate_source_id`) and exposes it through `getPreFilterReport()`. The predicates,
their evaluation order and the surviving set are unchanged. The report is recorded on
the instance rather than returned, so `scrape()` keeps its `RawScreening[]` signature
and no subclass or caller changes.

**Subclass overrides are reconciled.** `validate()` is overridable and three scrapers
call `super.validate()` and then filter again: `nickel-v2.ts` drops `MYSTERY MOVIE`
titles, `genesis-v2.ts` and `lexi-v2.ts` repeat the sourceId dedup (a no-op). The
base class recorded its report from its own predicates, so a Nickel batch of one
mystery screening reported `parsed: 1, accepted: 1, rejected: 0` while `scrape()`
returned nothing and the pipeline accepted nothing — a false conservation failure,
an accounting artefact rather than a real loss. `scrape()` now reconciles the report
against what `validate()` actually returned and attributes the shortfall to a sixth
reason, `subclass_filter`, which names the fact without the base class pretending to
know the subclass's reason. The surviving set passes through untouched; only counts
move. An override returning more than the base filter kept cannot be described by the
report, so it goes `"unavailable"` with a warning. No venue scraper was modified.

`getFetchedPayloadCount()` reports the length of the `string[]` from `fetchPages()`.
It is **not** an HTTP request count: a subclass hitting a bundled JSON API, or
concatenating a paginated fetch, makes several calls per entry. Named for the unit it
counts.

### Write-outcome decomposition, with no change to any write statement

`insertScreening` now returns `ScreeningWriteOutcome`:

| Outcome | Meaning |
|---|---|
| `upserted` | The `INSERT ... ON CONFLICT DO UPDATE` ran. Insert vs update not established. |
| `updated` | An `UPDATE ... WHERE id = ?` completed on a row `checkForDuplicate` had identified. |
| `unchanged` | The duplicate check said skip, or a 23505 collision left the row untouched. |
| `failed` | Candidate processing did not reach a confirmed successful outcome; this does not prove no row persisted. See below. |

`failed` means **"the write outcome could not be established"**. It is a
compatibility counter and two stronger readings are unsupported.

It does **not** prove no row persisted. `withDbTimeout` is a `Promise.race` and does
not cancel, so a statement abandoned at the 15s ceiling can commit afterwards — the
pre-existing note on `retryDeferredWrites` records the same thing, where a late
original insert makes the retry hit the unique index and "fail" while the row is in
the table. The legacy zero counters on the runner's exception and cap paths carry the
same caveat: zero there is a compatibility value, not evidence that nothing was
written. No statement cancellation is added by this patch.

It is also wider than a write failure. Three paths feed it: the write threw or was
dropped for a full deferred queue; `getOrCreateFilm` returned no id, so the whole
film group is charged without a write being attempted (a film-resolution loss such as
broken TMDB matching); or the film-level catch charged the batch remainder,
screenings abandoned before being attempted. A venue whose title matching is broken
therefore reports its loss here and can be misread as a persistence problem.
Splitting out `filmUnresolved` and `abandoned` is the honest fix — both are already
distinct code paths — and is recorded as a follow-up.

This needed **zero production write-statement change**: the duplicate branch already
knew it had issued an UPDATE and the skip branch already knew it had skipped. Only
the insert-on-conflict path is genuinely ambiguous, and it is named for what it is.

### Two measurements recorded as permanently unavailable

- `insertUpdateAttribution`. Splitting `upserted` needs `RETURNING xmax = 0` or a
  per-row pre-read. The first changes a production write statement; the second adds a
  per-row DB lookup purely for a counter. Both declined.
- `affectedRowAttribution`. Neither write statement carries `RETURNING` or reads a row
  count, so a row deleted concurrently between `checkForDuplicate` and the `UPDATE`
  yields zero affected rows and still completes without error. `upserted` and
  `updated` are therefore **statement completions**, not verified row changes. The
  helper is named `completedWrites`, not `persistedWrites`, and says so.

### Post-write failures separated from lost writes

A festival-link failure happens after the screening row is committed. It is counted
on `PipelineResult.postWriteFailures` and never in `write.failed`, and is carried
through `VenueResult.screeningsPostWriteFailures`,
`scraper_runs.metadata.postWriteFailures`, the `venue_completed` log and
`scripts/lcut-gapfill.ts`.

**It reaches the per-venue layer only.** `RunnerResult` gains no run-level total,
the `runner_completed` log omits it, and `VenueResult.success` stays `true`, so
`tmp/scrape-run-summary.json` — the file this project reports runs from — still
shows a clean run. Read it from `scraper_runs.metadata`, the `venue_completed` log,
or the per-venue `partial` status. A run-level rollup is a known follow-up.

`festivals/eventive-scraper.ts` is the only place a `RawScreening` is given a
`festivalSlug`, so it is the only current producer of a non-zero count; it now
accumulates and warns, and reports it on `TaggingResult.postWriteFailures`
(optional, because the reverse tagger writes links directly and never calls the
pipeline, so absence there means not measured rather than none). Every other
path — registry venue scrapes, the chain runner, the L-CUT gap-fill, the BFI
importers — is structurally zero today and is threaded anyway, because the
contract is about the post-write stage rather than about festivals.

`shouldRunSupersededCleanup` now also refuses when `postWriteFailures > 0`, so
separating the counters cannot quietly *enable* the superseded report where the merged
counter used to suppress it. `recordScraperRun` downgrades the run to `partial` with
its own distinct message, matching the visibility the merged counter used to give.

### Legacy aliases

`added`, `updated` and `failed` are retained as documented aliases
(`added = write.upserted`, `updated = write.updated + write.unchanged`,
`failed = write.failed`) so `shouldRunSupersededCleanup` and external consumers keep
working. See the behaviour change below for the one case where they differ from their
pre-patch values.

## Deliberate behaviour change

A festival-link failure used to propagate out of `insertScreening`.
`attemptScreeningWrite` rethrows anything that is not connection-shaped, so the throw
reached the film-level catch, which added that film's **entire remaining screening
list** to `failed` and abandoned it. Two things were wrong: rows already written were
counted as losses, and the untouched remainder of the film was never attempted.

`linkFestivalBestEffort` (new, exported for tests, mirroring the existing
`linkSeasonsBestEffort`) now swallows the failure and reports it through the
callback. The film's remaining screenings are written and counted.

**Consequence, stated plainly: for a venue with `festivalSlug` screenings and a
failing link, `added` now runs higher and `failed` lower than before this change.**
The legacy aliases are not bit-for-bit identical in that case. The old numbers
described writes that had in fact landed. The failure is not swallowed silently — it
surfaces on `postWriteFailures`, downgrades the run to `partial`, and still refuses
the superseded report.

## Bugs found and fixed on the way

- **`runSingleVenue`'s `saveScreenings` branch copied only `added`.** Any venue
  running with `useValidation: false` reported zero updates and zero failed writes
  however many there were, taking `metadata.failedWrites` down with it. Both branches
  now read the same fields.
- **The chain per-venue path had the same defect**, in its own copy of the branch.
  Also fixed.
- **`eventive-scraper.test.ts`'s pipeline stub was a partial `PipelineResult`.**
  It sits inside a `vi.mock` factory, so TypeScript never checked it against the real
  return type, and the ingester's new `total += result.postWriteFailures` would have
  become `NaN`. The stub now carries the full shape, and the new test asserts
  `Number.isInteger`, verified to fail against a partial result.

## Verification

| Check | Result |
|---|---|
| `npx vitest run --pool=threads` | 142 files, 2131 tests passed before current-main integration |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run lint` | 0 errors, 61 pre-existing warnings, none in changed files |

### Tested, and verified failing-before

Each of these was confirmed by reverting the fix and re-running, so none of them is
self-fulfilling.

- **The film loop continues past a festival-link failure.**
  `pipeline-festival-continuation.test.ts` drives the real `processScreenings` with
  two screenings of one film, the first one's festival lookup rejecting. Only the DB,
  title extractor, film cache, validator, diff and progress stamper are mocked; the
  film loop, `attemptScreeningWrite`, the `settled` bookkeeping, the film-level catch,
  `linkFestivalBestEffort` and `linkScreeningToFestival` are all production code. The
  test asserts **two rows reached `db.insert`**. With the helper made to rethrow it is
  one: the second screening is never attempted. It also pins `accepted: 2`,
  `write.upserted: 2`, `postWriteFailures: 1`, `failed: 0` and a clean
  `checkAccounting`.
- **Write conservation is not tautological.** Re-deriving `accepted` by summing the
  write buckets makes two `buildAccounting` seam tests fail (a candidate that reached
  no write outcome, and a surplus outcome).
- **The pre-filter report is reset between runs.** The test now fails the *second*
  scrape on the *same instance*; removing the reset at the top of `scrape()` makes it
  fail. A fresh instance could never have detected this, since it starts null anyway.
- **A subclass filter after `super.validate()` cannot falsify the counts.** A
  fixture subclass reproducing Nickel's `MYSTERY MOVIE` drop asserts the surviving
  set is untouched, `accepted` equals what `scrape()` returned, the shortfall is
  attributed to `subclass_filter`, and `checkAccounting` is clean. A pure-dedup
  override invents no reason entry, and an inflating override goes `"unavailable"`.
  Removing the reconciliation makes two of them fail.
- **The post-write failure reaches the festival ingester's result.** Its pipeline stub
  was a partial `PipelineResult` inside a `vi.mock` factory, which TypeScript never
  checks, so the new accumulation would have produced `NaN`; the stub is completed and
  a `Number.isInteger` assertion pins it, verified failing against a partial result.
- **`BaseScraper.validate()`'s real filter**: each rejection attributed to exactly one
  reason, the reason tally equalling the rejected total, and the surviving set
  unchanged.
- **`shouldRunSupersededCleanup` refuses on `postWriteFailures > 0`**, and the skip is
  logged with its reason rather than taken silently.

### Inspected, not tested

Stated plainly so nobody reads more coverage into this patch than it has.

- **`totalWrites(write) === accepted` on every path through `processScreenings`.**
  Traced by hand and by review across all five: the `!filmId` early `continue` (inside
  the try, so the catch cannot re-add it), the per-screening loop, `settled`
  bookkeeping for deferred entries, retry-budget exhaustion, and the film-level catch
  charging `length - settled`. The identity is structural — `accepted` is
  `screeningsToProcess.length` and every element is pushed into exactly one
  `screeningsByFilm` group — but only the festival path above exercises it in a test.
- **The `!filmId` branch, the defer/retry seam inside a real run, and the
  retry-budget cutoff.** `attemptScreeningWrite` and `retryDeferredWrites` are tested
  directly in `pipeline-retry.test.ts`; their interaction with `settled` inside
  `processScreenings` is held by review.
- **The chain per-venue path.** No accounting is built there, so there is nothing to
  test; the `postWriteFailures` threading through it is review-only.
- **`recordScraperRun`'s status downgrade.** Requires a DB; verified by reading.
- **The three live `validate()` overrides themselves** (`nickel-v2`, `genesis-v2`,
  `lexi-v2`). The reconciliation is tested against a fixture subclass of the same
  shape, not against those venue scrapers, which were not modified and are not
  driven here.

## Impact

- **Run reporting, `runSingleVenue` only.** A single-venue scrape logs an
  `[Accounting]` line with every stage count, printing `unavailable` verbatim where a
  count was not measured, shouts on a conservation failure, and stores the record
  under `scraper_runs.metadata.accounting`. **The chain per-venue path does not**:
  Curzon, Picturehouse and Everyman venues thread `postWriteFailures` but build no
  accounting, so they have no accounting line and no stored record. Nothing prevents
  wiring it (every count it needs is on the pipeline result, and per-venue
  `parsed`/`preFiltered`/`fetchedPayloads` are genuinely `"unavailable"` for a chain
  since one `validate()` covers them all); it is left out to hold this patch's scope
  and is a known follow-up.
- **Venues that lose a festival link** now report the screenings they actually wrote,
  and read as `partial` rather than as a large failed-write count.
- **Venues running `useValidation: false`** now report their updates and failed
  writes at all, in both the single-venue and chain paths.
- **No production DB write, no schema migration, no new dependency, no write-mode
  scrape.** No production write statement was changed.

## Measurements deliberately left unavailable

1. **Insert vs update** inside `upserted`. Needs `RETURNING xmax = 0` on a production
   write statement.
2. **Affected rows** for `upserted` and `updated`. Needs `RETURNING` on both.
3. **HTTP request volume.** `fetchedPayloads` counts payloads; nothing counts requests.
4. **`parsed`, `preFiltered` and `fetchedPayloads` for scrapers that do not extend
   `BaseScraper`** (for example `cinemas/the-nickel.ts`). Reported `"unavailable"`,
   never zero.

## Known follow-ups, deliberately not in this patch

1. **Wire accounting into the chain per-venue path**, so Curzon, Picturehouse and
   Everyman venues get an accounting line and a stored record.
2. **Split `write.failed`** into `filmUnresolved` and `abandoned`, so a broken
   title-matching stage stops reading as a persistence failure.
3. **Add a run-level `postWriteFailures` rollup** to `RunnerResult`, the
   `runner_completed` log and `tmp/scrape-run-summary.json`.
4. **Give `supplementary` a producer**, or drop it. Nothing sets it outside tests and
   nothing enforces the exclusion it documents.
5. **The `withDbTimeout` non-cancellation race** around late post-write failures. It
   needs real cancellation, not a counter change.
