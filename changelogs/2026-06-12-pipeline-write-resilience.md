# Pipeline write-resilience — retry queue, validator provenance, progress-file fix (plan 010)

**PR**: pending
**Date**: 2026-06-12
**Plan**: `plans/010-pipeline-write-resilience.md` (2026-06-11 scrape-accuracy audit)

## Changes

### 1. Progress-file writes survive concurrency and fresh checkouts (`src/lib/scrape-progress.ts`)
- The plan called for a recursive mkdir at the writer, but that already existed
  (`ensureDir`, PR #482). The actual cause of the 2026-06-11 "rename …
  tmp/scrape-progress.json ENOENT on every attempt" was a rename race: scrape
  waves run 3–4 venues in parallel and every concurrent `stampProgress` call
  shared one `.tmp` path — writer A's rename removed the temp file before
  writer B's rename ran.
- Temp filenames are now unique per write (`pid + counter`), preserving the
  atomic-rename pattern without the race.
- The `ensuredDir` memo resets on write failure, so a `tmp/` deleted mid-run is
  recreated on the next stamp instead of failing for the rest of the process.
- New tests (`src/lib/scrape-progress.test.ts`): fresh-checkout (missing
  nested dir), 25 concurrent stamps with zero failures and no orphaned temp
  files, dir-deleted-mid-run recovery.

### 2. End-of-venue retry queue for connection-timeout writes (`src/scrapers/pipeline.ts`)
- `insertScreening` failures classified by `isConnectionError` (plan 001's
  narrow DB-path classifier, reused as-is from `runner-factory.ts`) are pushed
  onto a per-venue `deferredWrites` queue as thunks closing over the resolved
  `filmId` + normalized screening — re-running them does NOT redo title
  extraction or TMDB matching.
- After the film loop (before `cleanup-superseded`), the queue is retried
  once, serially, with a 1s gap between attempts — the failure mode is pool
  contention; parallel retries would recreate it. A second failure is final
  for this run.
- Queue cap: 50/venue. Beyond that the venue is sick and plan 001's run-level
  circuit breaker is the responder — excess writes are logged, counted as
  failed, and dropped.
- Non-connection errors (e.g. FK violations) rethrow to the film-level catch
  unchanged — they would fail identically on retry.
- Final pipeline log gains `(N recovered on retry)`; the retry pass stamps
  `retry-deferred-writes` in the progress file.
- Tests (`src/scrapers/pipeline-retry.test.ts`): recover-once, fail-twice
  lands in failed, FK violation never retried, cap drops excess, serial
  ordering, one retry failure doesn't stop the queue.

### 3. Time-provenance-aware validation (`src/scrapers/types.ts`, `src/scrapers/utils/screening-validator.ts`)
- `RawScreening.timeSource?: "iso" | "text"` — how the datetime was derived.
  Set to `"iso"` by Curzon (Vista API), Picturehouse (API), Everyman
  (boxofficeapi), and Castle/Castle Sidcup (`data-start-time` attribute via
  the shared calendar parser). Text-parsed scrapers stay unset (= `"text"`).
- `suspicious_time_early` (<10:00) exists to catch AM/PM *text-parsing*
  errors; ISO timestamps can't have those. It is now warn-and-keep for
  `"iso"` (log line still surfaces in /scrape output) and reject-as-before
  for text.
- `too_far_future`: 90-day cap stays for text (guards parse-year errors);
  180 days for `"iso"` — long-lead event cinema (Met Opera/RBO/NT Live
  2026-27 seasons, 99–176 days out at the chains) is real and bookable.
- Tests: 09:00 iso kept with warning / 09:00 text rejected / 120-day iso kept
  / 120-day text rejected / 200-day iso still rejected.

## Sanity check (plan STOP condition: >500 newly admitted)
Read-only run of the plain-fetch ISO scrapers against live APIs (no DB
writes): the 180-day cap newly admits **201** screenings — Everyman 0,
Picturehouse 198 (NT Live, event cinema, advance bookings), Castle 2,
Castle Sidcup 1 (Met Opera: Macbeth, 129d). Curzon is Cloudflare/Playwright-
gated locally; extrapolating Picturehouse's ~8% ratio over Curzon's ~1,818
screenings estimates ~145 more, total ~350 — under the threshold. 191
Picturehouse screenings beyond 180 days are still rejected.

The same run pushed live Everyman data through the new validator:
valid=1705, rejected=0, with 145 `suspicious_time_early` warnings kept
(Toddler Club, Family Film Club, regular 09:00 shows) — previously all 145
were discarded.

## Impact
- Screenings dropped by Supabase pooler contention (19 lost at
  electric-white-city on 2026-06-11, more at rich-mix/castle/the-nickel) are
  recovered within the same run instead of waiting a week.
- Everyman morning kids' shows and Met Opera/NT Live 2026-27 dates appear on
  the calendar after the next scrape.
- Live "what's running RIGHT NOW" progress tracking works during concurrent
  waves for the first time since it shipped.
