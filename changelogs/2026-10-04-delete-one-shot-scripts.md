# Delete 72 finished one-shot scripts

**PR**: #PENDING
**Date**: 2026-10-04

## Changes
- Deleted 72 files, 10,867 lines. Each was re-grepped against package.json, the workflows, tsconfig and vitest config, the docs, dynamic imports, `vi.mock` paths and the main checkout's `.claude/commands`, `.claude/skills` and `.claude/rules`. None had a caller outside the deleted set.
- `scripts/`, the `/goal` loop (10): `goal-status.ts` and the 9 `goal-check-*.ts` it spawned. The `/goal` command is gone and nothing else runs them. `detectSilentBreakers` and `detectFlakyCinemas` stay live through `run-scrape-and-enrich.ts`.
- `scripts/`, May 2026 incident probes and one-row repairs (14): every `_`-prefixed script, including the two tracked `_tmp_curzon_bst_*` files.
- `scripts/`, screening dedupe (6): `cleanup-cinema-source-dupes`, `dedupe-screening-source-id-duplicates` and `audit-screening-duplicates` group on `(cinema_id, source_id)`, which the partial unique index `idx_screenings_cinema_source` caps at one row, so they always return 0. `cleanup-pcc-duplicate-screenings` and `cleanup-duplicate-screenings` delete on the proximity heuristic that `src/scrapers/pipeline.ts` now treats as report-only. `verify-screening-integrity` asserted legacy cinema IDs removed on 2026-05-27. Future phantom cleanup goes through `npm run reconcile:plan` / `reconcile:apply`.
- `scripts/`, row-pinned repairs (9): `cleanup-bfi-cluster-bug`, `dedup-bfi-sourceid-migration`, `delete-stoma-phantom`, `fix-bfi-booking-urls`, `fix-contaminated-booking-urls` and its `-v2` copy, `fix-non-film-content`, `fix-title-mismatches`, `unmerge-bad-films`.
- `scripts/`, verification harnesses for features merged in May (6): `apply-search-migration`, `verify-search-migration`, `verify-search-coverage`, `verify-people-search`, `diagnose-bst-bug`, `verify-bst-fix`. `src/scrapers/cinemas/bst-regression.test.ts` covers the BST cases in CI.
- `scripts/`, other stale scripts (5): `setup-posthog-dashboards` (a 2026-03 bootstrap on the React-era event set), `spot-check-and-fix` (its `/spot-check` command is gone), `autoresearch-status` (its writer was retired 2026-05-03), `check-db`, `check-films-without-ratings`.
- `src/scripts/` (6): `analyze-film-data-quality`, `reprocess-suspicious-matches`, `fix-film-metadata`, `add-cinema-coordinates`, `add-match-tracking-columns`, `count-films`. `enrich-upcoming-films` stays.
- `scripts/audit/` (9): `front-end-audit.ts`, `checkers/*`, `report-generator.ts` and `types.ts` matched only the legacy React DOM. `local-vs-baseline.ts` and `trigger-runs-audit.ts` were April one-shots. `mobile-audit.ts` imports none of them and stays.
- `src/db/` (7): `seed.ts`, `seed-screenings.ts` (both duplicated by `seed-cli.ts`), `run-festival-migration.ts`, `run-migration.ts` (both duplicated by drizzle migrations), `fix-placeholders.ts`, `cleanup-seasons.ts`, `check-pcc.ts`.
- `scripts/destructive-script-guards.test.ts`: the 18 deleted destructive scripts move from `defaultDryScripts` to `removedHazardousScripts`, which asserts they stay absent.
- `scripts/data-check.ts`: the local `levenshteinSimilarity` is now a one-line lowercase/trim wrapper over `src/lib/levenshtein.ts`; `UA` comes from `CHROME_USER_AGENT_FULL` (byte-identical); `fetchHtml` uses `AbortSignal.timeout` and awaits the body, so a timeout during the body read returns `null` inside its own `try`.
- `scripts/dedup-judgement/run.ts`: the local `mapLimit` is replaced by `mapConcurrent` from `scripts/typesafe-experiments/evaluation.ts`. After the first failed pair it stops starting new TypeSafe calls, where `mapLimit` kept spending budget on the remaining queue.
- `src/scripts/poster-audit-and-fix.ts`: six zeroed `PhaseResult` literals become one `emptyPhase()` helper.
- `src/scripts/reconcile-phantom-screenings.ts`: `validateCinemaId` was a wrapper around `knownIds.includes`; the call site inlines it and its 3 tests go.
- `src/scripts/run-scrape-and-enrich.ts`: dead `total` and its `void total;` removed. `scripts/typesafe-experiments/evaluation.ts`: unused `percent()` removed.
- `scripts/backfill-cinema-baselines.ts`: the header comment now cites the audit write-up at `tasks/trigger-audit-2026-04-26.md`.

## Impact
- Developers search 10,867 fewer lines. The 18 deleted destructive one-shots could still rewrite production rows if someone ran one by mistake; they are gone.
- Every existing `npm run` command keeps working. Git history keeps every deleted script.
- Tests: 161 files, 2,563 tests pass. Lint: 0 errors, 30 warnings. `tsc --noEmit` is clean.
