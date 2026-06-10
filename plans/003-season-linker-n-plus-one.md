# Plan 003: Eliminate the per-film N+1 queries in the season linker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ed1db0..HEAD -- src/scrapers/seasons/season-linker.ts src/scrapers/pipeline.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/002-unify-normalize-title.md (season-linker holds one of the `normalizeTitle` copies; do 002 first so this file imports the canonical helper)
- **Category**: perf
- **Planned at**: commit `8ed1db0`, 2026-06-10

## Why this matters

`linkFilmToMatchingSeasons` runs once per film during every scrape (called at
`src/scrapers/pipeline.ts:263`). For each film it loops over active seasons and,
for every season, issues a separate `SELECT` to check whether the link already
exists, then an `INSERT`. With ~1000+ films per full scrape and several active
seasons, that's thousands of sequential round-trips in the scrape hot path —
directly adding to the connection-pool pressure that contributed to the
2026-06-09 pooler exhaustion. `relinkSeasonFilms` is worse: it loads **all**
films and does a per-film `SELECT`. The redundant existence `SELECT` can be
removed entirely by relying on the unique constraint with
`ON CONFLICT DO NOTHING`, and the all-films scan can batch its existence check.

## Current state

`src/scrapers/seasons/season-linker.ts`:

- `linkFilmToMatchingSeasons(filmId, filmTitle)` (from line ~93). After loading
  the season cache, for each matching season it does:
  ```ts
  // Check if link already exists
  const existing = await db
    .select({ seasonId: seasonFilms.seasonId })
    .from(seasonFilms)
    .where(and(eq(seasonFilms.seasonId, season.id), eq(seasonFilms.filmId, filmId)))
    .limit(1);
  if (existing.length > 0) continue;       // ← redundant round-trip
  try {
    await db.insert(seasonFilms).values({ seasonId: season.id, filmId });
    linkedCount++;
  } catch (error) {
    console.warn(`[SeasonLinker] Failed to link film to season:`, error);  // ← swallows dup-key
  }
  ```
- `relinkSeasonFilms(seasonId)` (from line ~159) does:
  ```ts
  const allFilms = await db.select({ id: films.id, title: films.title }).from(films); // full table
  for (const film of allFilms) {
    // ...match...
    const existing = await db.select({ seasonId: seasonFilms.seasonId })
      .from(seasonFilms)
      .where(and(eq(seasonFilms.seasonId, seasonId), eq(seasonFilms.filmId, film.id)))
      .limit(1);                            // ← N+1
    if (existing.length > 0) continue;
    // insert...
  }
  ```
- `loadSeasonCache()` (lines 41–71) already caches active seasons for 5 minutes —
  leave it; it is not the N+1.

Schema fact to verify before relying on it: `seasonFilms` should have a unique
constraint on `(seasonId, filmId)` (a film can't be in a season twice). Confirm
in `src/db/schema/seasons.ts` (look for `uniqueIndex(...).on(seasonId, filmId)` or
a composite primary key). If it is NOT unique, Step 1 must add it via a Drizzle
schema change + migration — see STOP conditions.

Conventions to match:
- Drizzle `onConflictDoNothing()` is used elsewhere for idempotent inserts (grep
  `onConflictDoNothing` in `src/scrapers/`).
- Batched existence loads use a `Set` keyed on a composite string — see the
  in-memory `Set` patterns already in this file (`normalizedTitles`).

## Commands you will need

| Purpose   | Command                                                  | Expected |
|-----------|----------------------------------------------------------|----------|
| Typecheck | `npx tsc --noEmit`                                       | no new `src/` errors |
| Tests     | `npm run test:run`                                       | all pass |
| Lint      | `npm run lint`                                            | exit 0, 0 errors |
| Schema check | `grep -n "seasonFilms\|season_films" src/db/schema/seasons.ts` | shows the table + any unique index |

## Scope

**In scope**:
- `src/scrapers/seasons/season-linker.ts` — remove the redundant SELECTs.
- `src/scrapers/seasons/season-linker.test.ts` (create) — behavior + idempotency tests.
- `src/db/schema/seasons.ts` — ONLY if the `(seasonId, filmId)` unique constraint
  is missing (then also generate a migration with `npm run db:generate`).

**Out of scope**:
- `loadSeasonCache` TTL behavior — leave as-is.
- The matching/fuzzy logic (`levenshteinSimilarity`, `startsWith`) — do not
  change which films match; only change how existence is checked and inserted.
- `src/scrapers/pipeline.ts` beyond confirming the call site at line 263.

## Git workflow

- Branch: `perf/season-linker-batch`
- Conventional commits (`perf(seasons): drop N+1 existence checks in season linker`).
- Do NOT push or open a PR unless instructed. Update both changelogs.

## Steps

### Step 1: Confirm (or add) the unique constraint on `(seasonId, filmId)`

`grep -n "season_films\|seasonFilms" src/db/schema/seasons.ts` and read the table
definition. If a unique index/PK on `(seasonId, filmId)` exists, proceed to
Step 2. If NOT, STOP and report — adding a constraint to a live table needs a
migration reviewed separately and may require de-duping existing rows first.

**Verify**: you can state in the PR description whether the constraint already
existed.

### Step 2: Replace the per-season SELECT+INSERT with a single idempotent insert

In `linkFilmToMatchingSeasons`, delete the `existing` SELECT and the
catch-swallow. Use:
```ts
const inserted = await db
  .insert(seasonFilms)
  .values({ seasonId: season.id, filmId })
  .onConflictDoNothing({ target: [seasonFilms.seasonId, seasonFilms.filmId] })
  .returning({ seasonId: seasonFilms.seasonId });
if (inserted.length > 0) {
  linkedCount++;
  console.log(`[SeasonLinker] Linked "${filmTitle}" to season "${season.name}"`);
}
```
This collapses two round-trips into one and makes double-linking a no-op instead
of a caught exception.

**Verify**: `npx vitest run src/scrapers/seasons/season-linker.test.ts` → passes.

### Step 3: Batch the existence check out of `relinkSeasonFilms`

Before the film loop, load all existing links for this season once:
```ts
const linkedFilmIds = new Set(
  (await db.select({ filmId: seasonFilms.filmId })
     .from(seasonFilms)
     .where(eq(seasonFilms.seasonId, seasonId)))
    .map((r) => r.filmId),
);
```
Inside the loop, replace the per-film SELECT with `if (linkedFilmIds.has(film.id)) continue;`
and use the same `onConflictDoNothing` insert as Step 2.

**Verify**: `npx vitest run src/scrapers/seasons/season-linker.test.ts` → passes.

### Step 4: Update changelogs.

**Verify**: `git status` shows both changelog files touched.

## Test plan

- `src/scrapers/seasons/season-linker.test.ts` (create), mocking `db`:
  - "links a matching film once" — a film matching a season's raw titles inserts one link.
  - "is idempotent" — calling twice for the same (season, film) inserts only once
    and does not throw (asserts `onConflictDoNothing` path).
  - "does not link a non-matching film".
  - "relink batches existence" — assert the existence query runs **once**, not
    once-per-film (spy on `db.select` call count for the links query).
- Pattern to follow: a DB-mocking unit test such as
  `src/app/api/admin/screenings/screenings.test.ts` (mocks the drizzle chain).
- Verification: `npm run test:run` → all pass.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` → no new `src/` errors
- [ ] `npm run lint` → exit 0, 0 errors
- [ ] `npm run test:run` → all pass; new season-linker tests exist
- [ ] `grep -c "\.select(" src/scrapers/seasons/season-linker.ts` shows fewer selects than before (the two per-iteration existence selects are gone)
- [ ] `grep -n "onConflictDoNothing" src/scrapers/seasons/season-linker.ts` returns matches in both functions
- [ ] No change to the matching logic (`levenshteinSimilarity` / `startsWith` lines unchanged in `git diff`)
- [ ] Both changelog locations updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `(seasonId, filmId)` has no unique constraint (Step 1) — needs a separate,
  reviewed migration and possibly a de-dup of existing rows.
- The `existing` SELECT excerpts no longer match the live code (drift).
- Removing the catch-swallow surfaces a different error than duplicate-key in
  testing — investigate before shipping.

## Maintenance notes

- `onConflictDoNothing` relies on the unique constraint; if the schema ever drops
  it, double-links silently return and `linkedCount` undercounts. Keep them together.
- A reviewer should confirm the matching set is unchanged — this is a pure
  data-access optimization, not a matching-rule change.
- Further perf (deferred): replace the all-films scan in `relinkSeasonFilms` with
  a Postgres trigram/`word_similarity` candidate query so it doesn't load every
  film row — larger change, separate plan.
