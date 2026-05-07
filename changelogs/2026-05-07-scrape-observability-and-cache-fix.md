# /scrape observability + concurrency fixes (Ship 1)

**PR**: TBD
**Date**: 2026-05-07
**Branch**: `feat/scrape-observability-and-cache-fix`

## Why

Earlier today `/scrape` hung at 32 cinemas in. Process at 0% CPU, sleeping for 87 minutes after `[Pipeline] 58 valid screenings to process` with no errors logged. Three PRs already shipped today (#479 server-side timeouts, #480 stalest-first ordering, #481 client-side `withDbTimeout` + `DB_POOL_MAX`). Before re-running, six specialised agents audited the pipeline end-to-end (Database Optimizer, Backend Architect, SRE, Performance Benchmarker, code-explorer, Code Reviewer).

Their headline findings:

1. **We had no visibility** into the silent gap between `[Pipeline] X valid screenings to process` and the next log line. That's where the 87 minutes lived.
2. **Two concurrency hazards** we'd been silently getting away with — `filmCache` and `pendingRecords` were both module-level singletons in code paths that run cinemas concurrently (cap 4 per wave).
3. Performance findings looked compelling but **none had been measured** — three different agents nominated three different bottlenecks. Recommendation: instrument first, optimise from evidence.

This PR (Ship 1 of the plan at `~/.claude/plans/before-we-do-this-silly-deer.md`) lands the highest-leverage findings: observability + the two concurrency fixes. Performance work is deferred to Ship 2 and will be informed by the new instrumentation.

## What changed

### New file: `src/lib/scrape-progress.ts`

- `stampProgress(input)` — atomically writes `tmp/scrape-progress.json` (write-temp + rename, last-writer-wins for concurrent waves). Failures are warned and swallowed so a broken progress stamp can never fail the scrape itself.
- `readProgress()` — read the latest snapshot.
- `runPhase(cinemaId, name, fn, meta)` — wraps an async phase with start/done console logs, duration measurement, and progress stamps at start/done/error boundaries. Re-throws to preserve existing try/catch semantics.
- Output path overridable via `SCRAPE_PROGRESS_FILE` env var.

### `src/scrapers/pipeline.ts`

- Phases now wrapped with `runPhase`: `diff`, `init-film-cache`, `extract-titles`, `film-loop`, `cleanup-superseded`. The exact silent gap that produced today's 87-min hang now emits `[Pipeline] <cinema> > <phase> start` and `[Pipeline] <cinema> > <phase> done <ms>ms` lines.
- `processScreenings` start beacon: `stampProgress({ phase: "pipeline-start", meta: { rawCount } })` so the progress file shows the cinema entering the pipeline before any phase starts.

### `src/scrapers/utils/film-matching.ts` — concurrency fix #1

Was: module-level `filmCache`, `tmdbIdIndex`, `cacheStats`, `normalizeFn` singletons. Per-cinema `initFilmCache` reset them all. Cinema B's reset could wipe cinema A's mid-run cache → A re-creates films via `createFilmWithoutTMDB` → duplicate film rows for the dedup script to merge later.

Now: a `FilmCache` interface owned by each `runScraperPipeline` invocation:

```ts
export interface FilmCache {
  byTitle: Map<string, FilmRecord>;
  byTmdbId: Map<number, FilmRecord>;
  stats: { hits: number; misses: number; dbQueries: number };
  normalizeTitle: (title: string) => string;
}
```

All cache-touching functions now take `cache: FilmCache` as their first arg: `initFilmCache`, `lookupFilmInCache`, `addToFilmCache`, `matchAndCreateFromTMDB`, `createFilmWithoutTMDB`, `logCacheStats`. `findFilmBySimilarity` and `tryUpdatePoster` are unchanged (they don't touch cache state).

The TMDB-id lookup inside `matchAndCreateFromTMDB` is also wrapped with `withDbTimeout(p, 10_000)` for consistency with the rest of the pipeline.

### `src/scrapers/runner-factory.ts` — concurrency fix #2

Was: module-level `pendingRecords: Promise<void>[]` shared across every concurrent `runScraper` call in the process. `flushPendingRecords` did `splice(0)` to drain — racing flushes could swallow each other's pending writes.

Now: `AsyncLocalStorage<Promise<void>[]>` per-call context.

```ts
export async function runScraper(...) {
  return pendingRecordsContext.run([], async () => {
    try {
      return await runScraperInner(config, userOptions);
    } finally {
      await flushPendingRecords();
    }
  });
}
```

The try/finally guarantees flush runs whether the inner body returns or throws — closes a pre-existing leak where a throw before the original line-712 flush would lose pending records.

`pushPendingRecord` (the new fire-and-forget helper that replaces every `pendingRecords.push(...)` call site) emits a `console.warn` and detaches the promise's rejection chain if it ever runs outside a `runScraper` context — invariant violations are observable, not silent.

Removed: the now-redundant `await flushPendingRecords()` call in `createMain`'s failure path. With AsyncLocalStorage scoping it would be a no-op (no active store) — the inner `finally` already covered the failure case.

### `src/lib/jobs/scrape-all.ts` — per-cinema started/done logs

`runScraperEntry(entry, waveLabel)` now emits `[scrape-all] {wave}: {cinema} started` and `[scrape-all] {wave}: {cinema} done {ms}ms ok|fail (added X, updated Y)` for every wave entry, plus matching `stampProgress` calls. Wave-order log lines from #480 are unchanged.

### `src/scripts/run-scrape-and-enrich.ts` — Phase 0 pre-flight

A new pre-flight `detectSilentBreakers` runs at the START of `/scrape`. If any cinemas are silently broken (≥2 consecutive `success && screening_count=0` runs) the report prints with a suggestion to investigate via `/scrape-one <slug>` before sitting through a 30–60 min full run. Read-only, ~1s.

### `.gitignore`

Added `/tmp/` so the progress stamp doesn't leak into commits.

## What this enables for the next /scrape

If the run hangs again — `tail -f tmp/scrape-progress.json | jq` shows exactly which cinema, which phase, when it started, and the time since last heartbeat. Diagnosis takes seconds, not 87 minutes.

If a phase exceeds an unusual duration — the `[Pipeline] X > phase done Yms` lines stream live; we can spot a 60-second `init-film-cache` instead of an 87-minute mystery.

If cinemas are silently broken — Phase 0 surfaces them before we wait 30+ minutes. Same `detectSilentBreakers` function; called twice (start + end).

## Recovery posture (unchanged behaviour)

- A `runPhase` failure re-throws — the surrounding per-cinema/per-film try/catch in `runScraper` and `runScraperPipeline` still handles it. Same posture as before.
- A `stampProgress` failure logs a warning but never fails the scrape.
- `runScraper`'s wrapper finally guarantees `flushPendingRecords` runs on success and on throw, with a 5s ceiling.

## What is intentionally NOT in this PR (deferred to later Ships)

- **Performance**: missing `(cinema_id, source_id, datetime)` partial index, hoisting `initFilmCache` to session-scope, hoisting Layer 0 lookup out of the per-screening loop, parallelising the per-screening loop. Deferred until we have measurements from this PR's `runPhase` durations.
- **Resilience**: client-recreate on `withDbTimeout` rejection, retry shape (1 retry for Playwright, 3 for Cheerio), decoupling Letterboxd failure from whole-phase ok signal, blocking on `LARGE_DROP`, resumability checkpoint.
- **Diff-key normalisation mismatch** (Code Reviewer Tier 1 #3) — important but orthogonal; separate PR.

## Constraint reminder

Everything in this PR runs **locally on the Mac via `/scrape`**. No Inngest, Trigger.dev, Vercel cron, GitHub Actions schedules. `tmp/scrape-progress.json` is a local file. `detectSilentBreakers` is a local DB read. See `~/.claude/projects/-Users-jamesbarge-code-filmcal2/memory/feedback_local_only_no_off_mac.md`.

## Verification

- 890/890 tests pass.
- `npx tsc --noEmit` clean.
- `npm run lint` clean (0 errors, 41 pre-existing warnings unchanged).
- Reviewed by code-reviewer agent; one blocker addressed (`flushPendingRecords` no-op in `createMain` failure path → moved into `runScraper` wrapper's `finally`).
- Pending: end-to-end `/scrape` run with the new instrumentation. The progress file will be the canonical post-run artefact for verifying the fix worked.
