# /scrape follow-ups — is_repertory at write time + stale-cinema is_active filter

**PR**: TBD
**Date**: 2026-05-15

## Problem

Post-mortem of `Pictures/Data Quality/patrol-2026-05-15-*.md` (cycles 19 + 20) surfaced two recurring patterns that the prior `/scrape` PRs didn't close:

1. **`is_repertory` misflagged cycle-after-cycle.** 5 consecutive patrols (iter-91, iter-98, iter-103, iter-113, iter-115) each fixed exactly one `wrong_new_tag` issue — a repertory film (year < currentYear - 2) left at the default `is_repertory=false`. Patrol-1758's own diagnosis: *"100% catch rate for this specific class of follow-up. Compelling argument for adding `is_repertory = year < current_year - 2` directly to setTitleAndTmdb to eliminate the cycle-N+1 dependency."* Confirmed in DB: 8 films currently misflagged.
   - **Root cause**: `src/scrapers/utils/film-matching.ts:239` already calls `isRepertoryFilm(release_date)` on INSERT, but `src/scripts/cleanup-upcoming-films.ts:250-279` (the TMDB-matched UPDATE path) wrote `year` without recomputing `is_repertory`. So a freshly-enriched repertory film kept the default until the patrol noticed.

2. **`detectStaleCinemas` permanently lists inactive zombies.** The function shipped in PR #494 ignored `cinemas.is_active`. The next `/scrape` post-run report would have listed these 5 cinemas as "never scraped" forever: `curzon-camden`, `curzon-richmond`, `curzon-wimbledon`, `everyman-walthamstow`, `nickel` — all `is_active=false`, all have no scraper by design.

## Changes

### `src/scripts/cleanup-upcoming-films.ts`
- New import: `isRepertoryFilm` from `@/lib/tmdb/match` (the same helper `film-matching.ts:239` and `:267` already use).
- In the TMDB-match UPDATE around line 257, added `isRepertory: isRepertoryFilm(details.details.release_date)` alongside the existing `year: sanitizeYear(tmdbMatch.year)`.

### `src/lib/scrape-quarantine.ts::detectStaleCinemas`
- Added `WHERE c.is_active = true` to the SQL between `LEFT JOIN scraper_runs` and `GROUP BY`.
- Updated docstring (lines 109–120) to note that inactive cinemas are excluded with the rationale (zombie rows the user can't action).

## Impact

- **Patrols**: the recurring `wrong_new_tag` follow-up should drop to zero. Next 5 cycles should not see another iter-N+1 fix of this kind.
- **`/scrape` report**: post-run output's "Stale cinemas" block now reflects only actionable cinemas. Users see the actual stale set, not noise from rows that haven't moved in months by design.
- **Existing 8 misflagged rows**: will self-heal on the next `cleanup:upcoming` pass since the same script that left them broken now writes the flag correctly. No backfill needed.

## Verification

- Type-check (`npx tsc --noEmit`): clean.
- Lint (`npm run lint`): 0 errors.
- Vitest (`npm run test:run`): 931 / 931 pass.
- Live DB check (`detectStaleCinemas()` against prod): inactive set reported as 0 (was 5 pre-change).
- Patrol regression: next `/data-check` after a `/scrape` should report 0 `wrong_new_tag` fixes.

## Out of scope (deferred)
- Tier 2 phantom-screening surfacing (needs auto-delete vs warn design decision).
- Wave-by-wave failure detail in the report (separate observability PR).
- Booking-URL verifier rework.
