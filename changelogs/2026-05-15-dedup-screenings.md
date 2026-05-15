# Dedup screenings + prevent recurrence in /scrape

**PR**: TBD
**Date**: 2026-05-15

## Problem

The homepage was showing duplicate screenings across multiple cinemas, in three distinct shapes:

1. **Same datetime, different `film_id`** — e.g. Hard Boiled @ The Nickel showing two 16:15 rows. Caused by duplicate rows in the `films` table being resolved as different `film_id`s across scrape runs.
2. **Different datetime ~60min apart (BST off-by-one)** — e.g. Wake in Fright @ The Gate (15:30 + 16:30), Shrek @ Everyman Maida Vale (10:30 + 11:30). Same `source_id`, but an earlier (correct) scrape and a later (regressed) scrape both inserted rows. The recent BST fixes (#484, #485, #486) prevented FUTURE regressions but didn't reconcile the pre-existing rows.
3. **BFI Southbank "many films at same datetime"** — 6–10 unrelated films (Rose of Nevada, Surviving Earth, The Christophers, ...) all stored at the same UTC time (e.g. `2026-05-15 11:50:00+00`), each with a correct individual `source_id`. Different shape from (1) and (2): a parser bug, not a dedup constraint gap.

### Root causes

- The screenings unique index was `(film_id, cinema_id, datetime)` and the upsert in `processScreenings` used the same conflict target — neither included `source_id`. Two scrape runs that mapped the same `(cinema_id, source_id)` to a different `film_id` or `datetime` both succeeded as inserts.
- `checkForDuplicate` Layer 0 (in `src/scrapers/utils/screening-classification.ts`) matched on `(cinemaId, sourceId, datetime)`. The `datetime` predicate meant a re-scrape with a corrected datetime missed the existing row entirely.
- `getFollowingText` in `src/scrapers/bfi-pdf/programme-changes-parser.ts` called `$el.parent().text()`, which returns the parent's full text including sibling `<b>` element children. Every film in a multi-film paragraph saw every sibling's screening times in its regex pool.

## Changes

### Data cleanup (one-shot)

- **`scripts/cleanup-cinema-source-dupes.ts`** (new) — collapses `(cinema_id, source_id)` groups with >1 row.
  - Same-datetime groups: keep the row with the latest `scraped_at`.
  - Different-datetime groups: keep the **earlier datetime** (the BST regression always adds +1 h, so the earlier UTC value is the BST-correct one).
  - Default dry-run; `--apply` commits. Refuses to exit 0 if any (cinema, source_id) dups remain after apply — protects the unique-index migration.
- **`scripts/cleanup-bfi-cluster-bug.ts`** (new) — deletes BFI Southbank rows where ≥3 distinct films share a single `datetime` and all have `bfi-changes-*` source_ids. These were the parser-bug propagation rows; future BFI scrapes (with the fixed parser) will re-populate correct rows.

Run results on prod:
- Cleanup pass 1 (upcoming only): 710 rows deleted, 544 groups resolved.
- Cleanup pass 2 (all dates, after extending scope to satisfy unique-index migration): 254 additional rows deleted.
- BFI cluster cleanup: 351 rows deleted across 48 datetime clusters.
- Total: **1,315 bogus rows removed**.

### Pipeline prevention

- **`src/scrapers/utils/screening-classification.ts`** — `checkForDuplicate` Layer 0 now matches on `(cinemaId, sourceId)` only (dropped the `datetime` predicate). A re-scrape with corrected datetime now finds the existing row and updates it.
- **`src/scrapers/pipeline.ts`** —
  - The duplicate-found update path now sets `datetime: screening.datetime` so a BST-corrected re-scrape heals the existing row instead of leaving the old wrong-hour value.
  - The insert path's `onConflictDoUpdate` is now branched: when `sourceId` is present, the conflict target is `[cinemaId, sourceId]` (matching the new partial unique index) and the SET clause updates `filmId`, `datetime`, `scrapedAt`, `bookingUrl`. When `sourceId` is null, the legacy `[filmId, cinemaId, datetime]` target is preserved for the handful of scrapers that don't emit `source_id`.

### DB constraint

- **`src/db/migrations/0011_screenings_cinema_source_unique.sql`** — new partial unique index `idx_screenings_cinema_source ON screenings (cinema_id, source_id) WHERE source_id IS NOT NULL`. Enforces the invariant at the database level so any future scraper bug surfaces as a `23505` error rather than silently duplicating rows.

### BFI parser fix

- **`src/scrapers/bfi-pdf/programme-changes-parser.ts`** — `getFollowingText` rewritten to walk DOM siblings starting from the current `<b>` element, stopping at the next `<b>`/`<strong>`. A fallback handles the case where the screening times are direct text nodes inside the parent (cheerio's `nextAll()` skips text nodes): slices the parent's text from the end of this `<b>` up to the next bold sibling's text.
- **`src/scrapers/bfi-pdf/programme-changes-parser.test.ts`** (new) — two regression tests:
  - Two films sharing one `<p>` produce exactly one screening (the first film's), not two.
  - Two films across separate `<p>`s each keep their own screening.

## Impact

- **Users**: duplicated screenings disappear immediately for the four reported cases (Hard Boiled, Shrek, Wake in Fright, São Paulo) and ~544 other affected screenings across 46 cinemas. BFI Southbank's fake-time rows for Rose of Nevada / Surviving Earth / The Christophers / Mother Mary / etc. are gone until the next BFI scrape repopulates correct times.
- **Future scrapes**: re-running `/scrape` will UPSERT in place. Any BST regression that ever re-appears in a scraper now self-heals on the next run instead of leaving a wrong-hour row behind. The DB constraint guarantees this even if a future code path forgets to use the upsert.
- **Past data**: cleanup was bounded to whatever was duplicated; legitimate historical data was preserved.

## Verification

- Type-check (`npx tsc --noEmit`) clean for all modified files.
- Lint (`npm run lint`) clean (0 errors; existing warnings unchanged).
- Vitest (`npm run test:run`): 912 / 912 pass, including the new BFI parser regression test.
- Audit (`scripts/audit-screening-duplicates.ts`) reports `dup_triples: 0` post-cleanup.
- Migration verified via direct query on `pg_indexes`: `idx_screenings_cinema_source` present with the partial `WHERE (source_id IS NOT NULL)` clause.

## Follow-ups (out of scope)

- The underlying duplicate **films** table rows (separate from screenings) are still a source of the same-datetime dup class. `scripts/cleanup-duplicate-films.ts` exists; left alone in this PR because it touches enrichment + posters.
- A small number of legitimate "two films at same BFI time on different screens" pairs may still appear once BFI scrapes resume. They'll be allowed by the new constraint (different `source_id`s) and only flagged if the count exceeds the threshold in `cleanup-bfi-cluster-bug.ts`.
