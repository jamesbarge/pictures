# Screening writes now survive a season-link timeout

**PR**: TBD
**Date**: 2026-08-26

## Background

The 2026-08-25 `/scrape` run was killed ~19 minutes in, during wave 1. While
reading its log, a distinct defect surfaced that is independent of the kill and
of the pooler contention that triggered it.

## The defect

`src/scrapers/pipeline.ts`, inside the per-film loop of `processScreenings`:

```ts
try {
  const filmId = await withDbTimeout(getOrCreateFilm(...), 20_000, ...);
  if (!filmId) { result.failed += filmScreenings.length; continue; }

  await withDbTimeout(                       // <-- enrichment, ahead of the writes
    linkFilmToMatchingSeasons(filmId, firstScreening.filmTitle),
    10_000,
    ...
  );

  for (const screening of filmScreenings) {  // <-- the writes that matter
    ...
    settled++;
  }
} catch (error) {
  result.failed += filmScreenings.length - settled;   // settled === 0 above
}
```

Season linking ran *before* the insert loop and *inside* the same try block.
Under pool contention `withDbTimeout` rejects with
`linkFilmToMatchingSeasons: <title> timeout after 10000ms (client-side)`, which
reached the film-level catch with `settled` still 0. The catch therefore counted
the film's entire screening list as failed and continued to the next film.

Three consequences, in increasing order of cost:

1. The screenings were never inserted.
2. They never reached `attemptScreeningWrite`, so they were never added to
   `deferredWrites` and the end-of-venue retry pass could not recover them.
3. The inflated `failed` count then suppressed superseded cleanup for the venue
   via `shouldRunSupersededCleanup`, leaving orphaned rows in place.

A cosmetic season tag was able to veto the writes that are the entire purpose of
the loop.

## Measured impact (2026-08-25 run)

| Signal | Count |
|---|---|
| Films dropped via `linkFilmToMatchingSeasons` | 44 |
| Films dropped via `getOrCreateFilm` (20s ceiling, separate path) | 4 |
| Deferred screening writes lost after retry | 24 |
| Retry budget exhausted, "pool still unhealthy" | 3× (13 / 11 / 15 unretried) |

Venues whose batches were largely or wholly unwritten, and whose superseded
cleanup was consequently skipped. Counts are screenings entering the pipeline;
the Curzon Camden scraper reported 238 and 237 reached `processScreenings`:

| Venue | Processed | Failed writes |
|---|---|---|
| curzon-camden | 237 | 224 |
| everyman-hampstead | 107 | 107 (entire batch) |
| picturehouse-crouch-end | 275 | 49 |

## Changes

- Added `linkSeasonsBestEffort(filmId, filmTitle)`, exported for tests. It wraps
  the `withDbTimeout` call, logs a warning on failure, and returns 0 instead of
  throwing.
- Moved the call to *after* the screening insert loop.
- Added `src/scrapers/pipeline-season-link.test.ts`, 4 tests covering success,
  a client-side timeout, a non-connection failure, and the warning being emitted.

Two guards on purpose: the helper cannot throw, and its new position means
`settled` already equals the batch length if a future edit reintroduced a throw.

### What the tests do not cover

The tests pin guard one only. All four still pass if the call is moved back ahead
of the insert loop, which is the defect being fixed. Covering the position would
mean driving `processScreenings` end to end with `db` mocked plus the
module-private `getOrCreateFilm` and `insertScreening`. No test in this repo does that today,
and building the harness is larger than this fix. The position is
therefore held by review. The test file's header states that explicitly, so the
next reader knows where the coverage stops.

## Verification

- `npm run test:run` : 134 files, 2,013 tests, all passing.
- `npx tsc --noEmit` : clean.
- `npx eslint src/scrapers/pipeline.ts src/scrapers/pipeline-season-link.test.ts` : clean.
- Regression proof: with the try/catch removed from `linkSeasonsBestEffort`,
  all 4 new tests fail. Restored, all 4 pass.

## Impact

- Affects every venue on every scrape run. Under a healthy pool the path is
  never hit; under contention it was the single largest source of dropped
  screenings.
- Season membership now degrades independently: a film may miss its season tag
  for one run while its screenings still land. The skip is logged.

## Out of scope

The pooler contention itself is unchanged.

On the query shape, since an earlier draft of this note got it wrong:
`linkFilmToMatchingSeasons` (`src/scrapers/seasons/season-linker.ts:104-141`)
issues one `SELECT` per **matching** season per film, plus a possible `INSERT`.
Non-matching seasons hit `continue` before any query, and the season list itself
is behind a 5-minute module-level cache (`:24`, `:51`) that loaded twice across
this 19-minute run. So neither the cache load nor a per-season fan-out explains
the timeouts. It simply fails first because its ceiling is 10s where
`getOrCreateFilm` gets 20s.

The useful follow-up is therefore not "batch it": preloading the existing
`(season_id, film_id)` pairs into `SeasonCache` at load time would remove the
per-film `SELECT` at `:123` altogether, leaving only inserts for genuinely new
links. Note also that the fuzzy match at `:108-113` uses bare `startsWith` in
both directions, so a short season title matches many films and inflates the
count.

Also unaddressed:

- **The film-level catch never enqueues into `deferredWrites`**, even when
  `isConnectionError(error)` is true. `attemptScreeningWrite` defers
  connection-shaped failures; the film-level path does not. This is the 4 films
  lost inside the 20s `getOrCreateFilm` ceiling on this run, same shape as the
  bug fixed here, one layer up, and with no retry path.
- **`tryUpdatePoster`** (`src/scrapers/utils/film-matching.ts:470-499`) makes an
  outbound poster-provider HTTP call inside that same 20s budget. Its own
  try/catch means it cannot throw, but it can consume the whole budget and cause
  the same drop.
- **No aggregate counter for skipped links.** The gap shows only as one
  `console.warn` per film, so 44 skipped enrichments are invisible to the run
  summary. A `seasonLinksSkipped` field on `PipelineResult` would fix that, and
  it must stay out of `failed`, which gates the superseded DELETE.
- **The 10s per-film stall is retained** and now sits after the writes rather
  than before them. With no circuit breaker, a sustained pool problem costs 10s
  on every film in a venue against a 600s venue cap
  (`src/scrapers/runner-factory.ts:398`, `:438`), worst case on this run is
  ~440s of pure enrichment stall inside that budget, which could truncate a
  large venue's tail. Still a strict improvement, since the old code burned the
  same 10s and wrote nothing.
- **Orphaned rows at the three venues above**, which need a clean run to clear.

## Behaviour change worth knowing

A film whose insert loop throws a non-connection error part-way through now
skips season linking entirely, where previously the link happened first.
Cosmetic, and the screenings that did land are unaffected.
