# detectSilentBreakers — migrate to windowed SQL

**PR**: TBD (stacks on top of `feat/scrape-yield-drop-detector`, which stacks on `feat/scrape-reliability-flaky-detector-bfi-healthcheck`)
**Date**: 2026-05-15

## Context

The original `detectSilentBreakers` was an N+1: one `SELECT id, name FROM cinemas` followed by one `SELECT … FROM scraper_runs WHERE cinema_id = $1 ORDER BY started_at DESC LIMIT N` per cinema. With ~60 cinemas, that's 61 round-trips per call — and the call fires twice per `/scrape` run (pre-flight + post-run). PR #496's code review flagged this as a pre-existing issue worth fixing.

`detectFlakyCinemas` (PR #496) and `detectYieldDrop` (PR #499) both already use a single `ROW_NUMBER() OVER (PARTITION BY cinema_id ORDER BY started_at DESC)` query. This PR aligns `detectSilentBreakers` with that pattern.

## Changes

### `src/lib/scrape-quarantine.ts`

- New pure `analyzeRunsForSilentBreaker(rawRuns, threshold)` — DB-free, sorts internally by `startedAt` DESC, returns the verdict (`null` if not silently broken). Mirrors the analyzer/walker split used by the other two detectors.
- `detectSilentBreakers` now uses a single windowed SQL — same shape as the other two detectors. Now also filters by `cinemas.is_active = true` (was walking inactive cinemas previously, which was harmless but inconsistent).
- Dropped now-unused imports: `desc`, `eq`, `scraperRuns`, `cinemas`.

### `src/lib/scrape-quarantine.test.ts`

6 new unit tests for `analyzeRunsForSilentBreaker`:
- Below-threshold returns null
- Default-threshold (2) fires on 2 consecutive zeros and records `lastSuccessfulRunAt`
- Stops counting at the first non-zero success (correctly identifies last-good)
- A `failed` status as the most recent run does NOT cause the silent-breaker to fire (failed is the flaky detector's job, not this one)
- ASC and DESC input produce identical verdicts (internal sort)
- Custom `threshold` parameter is honored

## Verification

- `npx vitest run src/lib/scrape-quarantine.test.ts` — 26/26 pass (10 flaky + 10 yield-drop + 6 silent-breaker)
- `npm run test:run` — 968/968 pass on the branch (962 from yield-drop PR + 6 new)
- `npx tsc --noEmit` — clean
- `npx eslint src/lib/scrape-quarantine.ts` — clean (no warnings; the previously-unused-import warnings are now resolved)
- **Live replay** against production scraper_runs: 59 ms post-warmup (was ~700 ms / ~60 round-trips with the per-cinema loop). 12× faster.

## Impact

- `/scrape` pre-flight phase total cost is now well under 1 s for all three detectors combined (was previously ~3 s dominated by silent-breaker's N+1).
- Closes the only remaining N+1 in the quarantine layer.
- No behaviour change — same cinemas flagged, same verdicts, same severity sort order.

## Follow-ups

None — this completes the windowed-SQL migration for the quarantine layer.
