# Prioritise stale cinemas in `/scrape` — stalest first within each wave

**PR**: TBD
**Date**: 2026-05-07
**Branch**: `feat/prioritise-stale-cinemas`
**Driven by**: User wants `/scrape` to refresh the cinemas that haven't been scraped recently *first*, so that if a run is interrupted partway through, the freshest data has already been collected for the staler cinemas.

## Why

The previous `/scrape` order was the registry's hard-coded array order within each wave. After a partial run (which is what happened twice yesterday — postgres-js stalls killed manually), the cinemas at the END of each wave's array got the least refresh. That's exactly the wrong outcome — they're often the same ones that were stale before the run started.

User said: "i want to prioritise cinemas that haven't been scraped recently".

## Changes

`src/lib/jobs/scrape-all.ts`:

### New helpers

- **`loadFreshnessMap(): Promise<Map<string, Date>>`** — queries `scraper_runs` once for `MAX(completed_at) GROUP BY cinema_id WHERE status = 'success'`. Cinemas that have never had a successful run are absent from the map.
- **`getEntryCinemaIds(entry): string[]`** — builds the entry's config and extracts every cinema_id it touches. `single` → 1 id, `multi`/`chain` → all venues.
- **`entryStaleness(entry, freshness): number`** — returns the OLDEST timestamp (epoch ms) across the entry's venues. Returns 0 for entries containing any never-scraped venue, putting them at the absolute top of the queue.

### `runWave` change

`runWave(wave, label, concurrency, freshness)` now sorts entries by `entryStaleness ASC` before fanning out to `runWithConcurrency`. Concurrency cap is unchanged (4 per wave), so the worker pool still picks up tasks in queue order — meaning the first 4 to start are the 4 stalest entries.

The new logic logs the per-wave ordering with human-friendly age strings:

```
[scrape-all] Chains order (stalest first): chain-everyman(7d), chain-curzon(2d), chain-picturehouse(0d)
[scrape-all] Playwright order (stalest first): bfi(never), barbican(5d), garden(2d), close-up-cinema(2d), riverside-studios(1d), olympic-studios(0d), coldharbour-blue(0d)
[scrape-all] Cheerio order (stalest first): castle-sidcup(never), the-nickel(3d), genesis(2d), ...
```

### `runScrapeAll` change

Loads the freshness map once at the top, passes it to each `runWave` call. One DB round-trip total, not per-wave.

## What didn't change

- **Wave structure** stays. Chains still run before playwright before cheerio. The reason is operational, not staleness-based: chains share auth-flow state, playwright cinemas are memory-heavy, cheerio is fast — these are concurrency-budget concerns that wave grouping handles correctly.
- **Per-cinema scrape behavior** is unchanged. Same `runScraper` call, same retries, same validation.
- **Concurrency cap** of 4 per wave is unchanged. Within a wave's stalest-first queue, up to 4 entries run in parallel.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors.
- `npm run test:run` — 890 / 890 passing.
- No new tests — this is ordering + observability only. The sort is a pure function of `freshness` and `getEntryCinemaIds`; `entryStaleness` returns 0 for never-scraped which guarantees never-scraped venues come first by construction.

## Edge cases

- **Cinema retired from registry but rows remain in `scraper_runs`**: harmless — the map entry exists but no registry entry consumes it.
- **Cinema added to registry but never run**: `loadFreshnessMap` returns no entry for it; `entryStaleness` returns 0; entry runs first.
- **Tied timestamps** (sub-millisecond ties from a recent batched scrape): falls back to original array order via stable sort. Doesn't matter operationally.
- **`completedAt` is null** (a run that started but didn't finish): `MAX(completed_at)` ignores nulls, so a partially-complete run doesn't update freshness for that cinema. Means a cinema whose last "completion" was a long time ago still sorts as stale even if a recent run started but never finished.

## Out of scope

- **Cross-wave staleness ordering** — could let a never-scraped cheerio venue jump ahead of a freshly-scraped chain. Deferred because waves exist for parallelism/memory reasons that staleness doesn't replace.
- **Per-screening staleness** (skip cinemas whose data is <4h old entirely) — possible but not requested.
- **CLI flag `/scrape --stalest-only N`** — could be useful for quick refresh runs, but not requested.
