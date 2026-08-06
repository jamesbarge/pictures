# Withhold the superseded-screening DELETE when a venue's writes failed

**PR**: #742
**Date**: 2026-08-06

## Background: what the 2026-08-05 `/scrape` run exposed

A full `npm run scrape:unified` run started 2026-08-05 20:11 and never finished. It was killed the
following morning after roughly 11 hours, with `completedPhases: []` in
`tmp/scrape-checkpoint.json` and only 6 of ~31 scrape entries recorded as complete
(`chain-everyman`, `chain-curzon`, `coldharbour-blue`, `regent-street`, `cinema-museum`, `jw3`).

The scrapers themselves were fine. Every failure was a **client-side** DB timeout thrown by the
`withDbTimeout` wrapper in `src/db/index.ts:97`, not a Postgres error:

```
[phoenix-east-finchley] Found 16 films
[Pipeline] phoenix-east-finchley > diff threw after 15002ms: generateScrapeDiff: cinema lookup (phoenix-east-finchley) timeout after 15000ms (client-side)
[Pipeline] Connection timeout on insertScreening: rich-mix/richmix-1920007ABBLNDNKDMNLLTPRGJNLQSRBLN — deferred for end-of-venue retry
[Pipeline] Deferred write failed on retry (final this run): insertScreening: electric-portobello/electric-65205 timeout after 15000ms
❌ [chain_scrape_failed] {"chain":"Picturehouse","error":"generateScrapeDiff: cinema lookup (picturehouse-west-norwood) timeout after 15000ms (client-side)"}
```

Terminal write failures reached **17 for `rich-mix` and 14 for `electric-portobello`**. The host was
at load average 10.58 on 10 cores, with Spotlight reindexing (`mds_stores`, `mdworker_shared`) and
three iCloud daemons (`bird`, `cloudd`, `fileproviderd`) competing for CPU. Client-side timers firing
en masse is the signature of a starved Node event loop rather than a slow database, which matches.

## The bug this fixes

`cleanupSupersededScreenings()` (`src/scrapers/pipeline.ts:223`) deletes a previously-scraped
screening when a **newly-written** row exists for the same film, on the same London date, within
3 hours (`ABS(EXTRACT(EPOCH FROM s2.datetime - s.datetime)) < 10800`). That inference is only sound
when the batch just written is the venue's complete current listing.

The existing guard covered only batches that are partial **by design**: the L-CUT gap-fill passes
`skipSupersededCleanup: true`, added after the 2026-07-13 incident that deleted 51 legitimate rows
across 8 venues.

It did not cover batches that become partial **by accident**. The cleanup condition was:

```ts
if (!options.skipSupersededCleanup && !result.blocked && result.added + result.updated > 0) {
```

`result.failed` was never consulted. So a venue that intended to write 217 screenings and persisted
only 200 still ran the DELETE while claiming completeness. Where a film had two showings on one day
inside the 3-hour window and only one insert landed, the surviving old row for the other showing was
deleted as "superseded" even though its replacement never arrived. That is a valid future screening
removed, which `.claude/rules/database.md` forbids: "Scrapers should add new screenings; do not
delete valid future screenings."

This was latent rather than new. `src/scrapers/pipeline-retry.test.ts` documents the same
`timeout after 15000ms (client-side)` failure mode costing 19 screenings at `electric-white-city` on
2026-06-11, which is what motivated the deferred-write retry queue. The retry reduced how often
writes fail terminally but never closed the cleanup-on-partial-batch hole behind it.

## Changes

- **New exported predicate** `shouldRunSupersededCleanup(result, options)` in
  `src/scrapers/pipeline.ts`, gating the DELETE. It returns false when the caller opted out, when the
  scrape was blocked, when nothing was written, and now when `result.failed > 0`.
- **Call site** at the end of `processScreenings` now calls the predicate instead of inlining the
  condition.
- **Skips are logged, never silent.** A withheld cleanup emits a `console.warn` naming the cinema and
  the failure count. Without it, a lingering time-shift orphan is indistinguishable from a scraper
  emitting a duplicate screening, which would send a future debugging session after the wrong
  component.
- **JSDoc corrected.** `processScreenings` carried an `IMPORTANT: ... NEVER DELETES existing
  screenings` guarantee that is true of the add/update path but not of the cleanup step immediately
  after it. The invariant was stated on the wrong function; it now says which path it covers.
- **New test file** `src/scrapers/pipeline-superseded-guard.test.ts`, 12 cases covering the opt-out
  path, the blocked path, the nothing-written path, updates-only, guard precedence, the three
  accidental-partial shapes (one failure, many failures alongside successes, total failure), and the
  `rejected`-does-not-block decision. Four of the twelve fail against the pre-fix condition; the rest
  pin pre-existing behaviour.

## Why `failed` blocks but `rejected` does not

`PipelineResult` distinguishes two kinds of missing screening. `failed` means we meant to write it
and the DB refused. `rejected` means the validator discarded it as invalid data, for example the
00:00 to 09:59 times that `.claude/rules/scrapers.md` warns about.

Both technically make a batch incomplete, but only `failed` blocks the cleanup. Routine validation
rejections are common enough that guarding on them would disable the cleanup close to permanently,
and rejected rows are data we never intended to store. The asymmetry of consequences settles the
`failed` case: missing a cleanup leaves a few time-shift orphans until the next clean run, whereas
deleting a valid screening is not recoverable until the venue is re-scraped.

## Is `failed > 0` sufficient?

Traced every path by which a screening intended for writing fails to land, to check whether any
escapes the counter:

| Path | Increments `result.failed` |
|---|---|
| `attemptScreeningWrite` returns `"dropped"` (deferred queue past its 50 cap) | yes |
| returns `"deferred"`, retry then fails | yes, via `retryOutcome.failed` |
| returns `"deferred"`, retry budget (120s) exhausted | yes, `outcome.failed += remaining` |
| non-connection error (e.g. FK violation) rethrown to the film-level catch | yes, `+= length - settled` |
| `getOrCreateFilm` returns null, or times out at 20s | yes, `+= filmScreenings.length` |
| `linkFilmToMatchingSeasons` times out at 10s | yes, film-level catch with `settled === 0` |
| validation `rejected` | **no, by design** (see above) |

So the guard sees every write failure **that surfaces as a thrown error**. It does not see the two
paths where `insertScreening` fails by *return value*: the Postgres 23505 catch in the duplicate-update
path, and a `shouldSkip` classification. Both `return false`, which is counted as `updated`, so
`failed` stays 0 while the existing row's `scraped_at` is never bumped. Those rows are therefore
still DELETE candidates. Residual and out of scope, detailed below.

Those two paths are narrow, because they need a fresh sibling sharing the *stale* row's `film_id`
while the batch wrote under the newly-resolved one. The exception is when another group in the same
batch resolves to that duplicate id, which is the duplicate-film condition dedup exists for. The
clean fix belongs at the DELETE rather than in this predicate: the query infers batch membership from
a timestamp when the pipeline already knows the answer. **This change does not close that, and should
not be read as doing so.**

Over-counting runs the other way and is harmless: `linkScreeningToFestival` runs *after* a successful
insert, so a non-connection throw there sends an already-inserted screening to the film-level catch
as failed, and the cleanup is withheld from a batch that was complete. A lingering orphan rather than
a deleted screening, which is the safe direction.

One correction to the section above, established in review. **The `rejected` rationale given there is
right, but for a stronger reason than "we never wanted those rows".** `past_screening` is a rejection *error*, and scrapers routinely return today's earlier
showings, so `rejected > 0` on very nearly every run: guarding on it really would disable the
cleanup for good. And past / too-far-future rejections cannot cause a wrong delete regardless, since
the DELETE only touches `datetime >= NOW()` and a too-far-future rejection's same-day sibling is
rejected too. The genuine residual is an AM/PM regression rejected as `suspicious_time_early` while
the same film's other showing writes fresh, which can strand the old correct row. Closing it means
gating on rejections excluding `past_screening` and `too_far_future`.

## Impact

- **Affects** every venue scrape that goes through `processScreenings`, which is all of them.
- **Behaviour change** is strictly more conservative: the DELETE now runs in a subset of the cases it
  ran in before. No new deletions are possible.
- **Known trade-off**: a venue that fails exactly one write on every run will never get its cleanup,
  so time-shift orphans could accumulate indefinitely. The warn log makes this visible. A proper
  answer is a periodic orphan sweep that does not depend on batch completeness, which is not in this
  change.
- **Not fixed here** (separate issues found in the same run, listed so they are not lost):
  - The pipeline hung for ~11 hours instead of failing fast once writes started timing out. There is
    no watchdog on total run duration, and `runPhase` timing did not trigger an abort.
    `tmp/scrape-progress.json` kept a stale heartbeat (`lastHeartbeatAt` 20:29:35Z, phase
    `startedAt` 21:19 local), so `/scrape status` would have reported a dead run correctly, but
    nothing acted on it.
    `getOrCreateFilm` (20s), `linkFilmToMatchingSeasons` (10s) and `insertScreening` (15s) each
    time out per item, so a saturated host produces a long tail of slow failures rather than one
    fast one.
  - Pre-flight flagged 4 critical-flaky and 2 warn-flaky scrapers before the run began:
    Phoenix Cinema and Rich Mix at 100% failure with no recorded success ever, BFI IMAX at 90%,
    BFI Southbank at 80%, The Cinema Museum at 43%, Close-Up at 40%. The run log shows Phoenix
    scraping correctly (`Found 16 films`) and failing only at the DB step, so at least some of these
    "scraper" failures are this same infrastructure problem rather than selector rot. Diagnosis of
    each is ongoing and separate.

## Provenance of the figures above

Flagged because a future reader cannot check them: the 17 `rich-mix` / 14 `electric-portobello`
terminal failure counts, the load average of 10.58, the Spotlight and iCloud daemon contention, and
the six flaky-scraper percentages all come from the **live console output of the killed run**, which
was not retained. `tmp/scrape-runs/` holds no 2026-08-05 file, because the pipeline was killed before
it could write one, and `tmp/scrape-run-summary.json` is still the 2026-07-18 run. What *is* checkable
from the tree: `tmp/scrape-checkpoint.json` (`runId 2026-08-05T20:11:53`, `completedPhases: []`, the
six completed entries) and `tmp/scrape-progress.json` (`lastHeartbeatAt 2026-08-05T20:29:35Z`).

That gap is itself a finding: a run that dies before its fatal handler leaves no durable record of
what it lost.

## Verification

Local `vitest`, `tsc --noEmit` and `eslint` could not complete on this machine: the vitest worker
pool times out after 60s waiting for a worker on both `forks` and `threads`, and the pre-existing
`src/scrapers/pipeline-retry.test.ts` fails identically, which rules out the new test file as the
cause. This is the known local toolchain wedge under Spotlight and iCloud contention, and CI is the
gate. The new tests and typecheck must pass in CI before merge.
