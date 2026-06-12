# Plan 009: sourceId for the 13 scrapers lacking one + generalized phantom-row reconcile

> **Executor instructions**: Follow step by step. The reconcile script
> deletes production rows — guarded, default-dry, per-cinema. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 716e543..HEAD -- src/scrapers/chains/ src/db/schema/screenings.ts src/scripts/_bfi_reconcile.ts`
> On drift in chain scrapers or the screenings schema, compare before
> proceeding. Also confirm plan 004 already ran the staged BFI sweep —
> if not, run plan 004 step 4 first.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED-HIGH (deletion logic; mitigated by per-cinema scoping,
  dry-default, and the "current sibling must exist" family of guards)
- **Depends on**: 004 (BFI sweep executed). Independent of 005–008.
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

The pipeline is upsert-only and **never** removes screenings that vanish
from the source. Stable dedup therefore depends on `sourceId` — and 13 of
26 scrapers don't set one (verified 2026-06-11: Curzon, Picturehouse,
Everyman, Phoenix, Genesis, Garden, Lexi, and others rely on the
`(film_id, cinema_id, datetime)` unique index). Consequences observed live:

- BFI's sourceId scheme change stranded ~64 phantom rows + 33 near-dup
  pairs (same film 19:00/19:10/19:20 the same evening) — cleaned by the
  staged one-off `src/scripts/_bfi_reconcile.ts`, but the same incident
  will recur on any scraper whose parser changes.
- During the 2026-06-11 run, the diff phase reported LARGE_DROP warnings
  ("438/615 screenings removed (71%)", "63/63 (100%)") — those "removed"
  sets are rows the source no longer lists, which today just accumulate.
- Venues with multiple screens can show the same film at the same minute on
  two screens; without sourceId, the unique index collapses them to one row.

## Current state

- `src/db/schema/screenings.ts:94-97` — partial unique index
  `(cinema_id, source_id) WHERE source_id IS NOT NULL`; plus the
  `(film_id, cinema_id, datetime)` unique index as the no-sourceId fallback.
- Stable keys ALREADY PRESENT in each scraper's data but unused for sourceId:
  - **Curzon** (`src/scrapers/chains/curzon.ts`): Vista OCAPI schedule
    objects carry a unique id per showtime (inspect the fetched schedule
    JSON — field name likely `id` on each session object).
  - **Picturehouse** (`src/scrapers/chains/picturehouse.ts`): `ShowTime.SessionId`.
  - **Everyman** (`src/scrapers/chains/everyman.ts`): theater id + movie id
    + ISO start time from the boxofficeapi payload.
  - **Phoenix / Genesis**: a `perfCode` is already extracted (~line 138/139
    of each scraper).
  - **Garden / Lexi / others**: no upstream id — derive
    `{cinemaId}-{slug(filmTitle)}-{datetime.toISOString()}` (deterministic;
    survives re-scrapes; changes only if the title text changes, which is
    acceptable and exactly what the reconcile sweep then cleans).
- `src/scripts/_bfi_reconcile.ts` — staged one-off: scrape live → upsert →
  rows with `scraped_at < runStart` AND matching the venue = phantoms →
  guarded batch delete. Generalize this.

## Scope

**In scope**: the 13 scraper files (sourceId only — no other behavior
change), `src/scripts/reconcile-phantom-screenings.ts` (new, generalized
from `_bfi_reconcile.ts`), package.json script entries
(`reconcile:plan` / `reconcile:apply`), tests, SCRAPING_PLAYBOOK.md,
changelogs. Delete `src/scripts/_bfi_reconcile.ts` once superseded (it was
never committed — it's untracked; fold its logic in and remove the file).

**Out of scope**: changing the unique indexes; any automatic deletion wired
into the pipeline (reconcile stays a manually-invoked script until it has
months of clean history); fixing the diff report's LARGE_DROP heuristics.

## Git workflow

Branch `feat/sourceid-reconcile`; conventional commits; both changelogs;
code-reviewer agent before PR (many files).

## Steps

### Step 1: sourceId rollout, scraper by scraper

For each scraper, set `sourceId` on every emitted RawScreening using the
stable key table above, prefixed with the venue id, e.g.:

```ts
sourceId: `curzon-${venueCode}-${session.id}`,
```

Commit per scraper-group (chains in one commit each; small singles batched).
For derived (no-upstream-id) scrapers use the deterministic composite:

```ts
sourceId: `${this.config.cinemaId}-${slugify(filmTitle)}-${datetime.toISOString()}`,
```

(`slugify`: reuse an existing slug helper — `grep -rn "function slugify\|toSlug" src/ | head` — do not add a dependency.)

**CRITICAL ROLLOUT NOTE**: the moment a scraper starts emitting sourceId,
its previously-inserted rows (sourceId NULL) become unmatchable by the
`(cinema_id, source_id)` index and the upsert will create **duplicates** of
every future screening (the `(film_id, cinema_id, datetime)` index will
actually prevent exact dupes — but time-shifted ones survive). Therefore:
each scraper's sourceId change MUST be followed by a reconcile run for that
cinema (Step 2) in the same working session. Sequence per scraper:
deploy change → scrape once → `reconcile:plan <cinema>` → review → apply.

**Verify per scraper**: scrape the venue once; then
`SELECT count(*) FILTER (WHERE source_id IS NULL) FROM screenings WHERE cinema_id='<id>' AND datetime >= now()`
→ shrinking toward 0 after reconcile.

### Step 2: Generalize the reconcile script

Create `src/scripts/reconcile-phantom-screenings.ts` from
`_bfi_reconcile.ts`'s logic, parameterized:

```
npx tsx --env-file=.env.local src/scripts/reconcile-phantom-screenings.ts <cinemaId>            # plan (dry)
npx tsx --env-file=.env.local src/scripts/reconcile-phantom-screenings.ts <cinemaId> --execute  # apply
```

Hard guards (all non-negotiable, mirror `_bfi_reconcile.ts`):
1. Single cinema per invocation; cinemaId must exist in the registry.
2. A successful scrape of that cinema must have completed within the last
   2 hours (check `scraper_runs`) — otherwise refuse: a reconcile against a
   stale scrape would delete *valid* rows.
3. Only delete rows with `datetime >= now()` AND
   `scraped_at < <last successful run start>` (i.e. the live scrape did not
   refresh them).
4. Refuse if the plan would delete >40% of the cinema's upcoming rows
   (override flag `--force-large` prints a red warning and still requires
   `--execute`).
5. Print every doomed row (title, datetime, source_id, scraped_at) in plan
   mode; `--execute` deletes in batches of 100 inside a transaction.

Add package.json scripts `reconcile:plan` / `reconcile:apply` mirroring the
repo's other maintenance scripts (default-dry convention from PR #660).

Unit tests for the guard logic (extract guards into pure functions:
`isReconcileSafe(lastRunAt, now)`, `exceedsDeletionCap(planned, total)`).

### Step 3: Run reconciles for the worst offenders

In order, with operator-visible plan output between each: `phoenix-east-finchley`
(known near-dup pattern: Tuner/Disclosure Day at 15-min offsets), then each
chain venue that showed LARGE_DROP ≥70% in the 2026-06-11 logs
(`grep LARGE_DROP` in the run log — curzon-mayfair, curzon-aldgate,
regent-street among them). Record per-venue deletion counts in the PR.

### Step 4: Playbook + changelogs + PR

SCRAPING_PLAYBOOK.md: document each scraper's sourceId scheme (this is what
makes the NEXT scheme change detectable). Both changelogs; code-reviewer
agent; PR.

## Done criteria

- [ ] All 13 scrapers emit sourceId; playbook documents each scheme
- [ ] `reconcile-phantom-screenings.ts` exists with all 5 guards + tests
- [ ] Per-scraper rollout sequence (scrape → reconcile) completed; NULL
      source_id upcoming rows ≈ 0 for migrated venues
- [ ] `_bfi_reconcile.ts` removed (superseded)
- [ ] tsc/lint/test:run green; changelogs + `plans/README.md` updated

## STOP conditions

- A reconcile plan wants to delete >40% of a venue's upcoming rows.
- Any deletion would touch `datetime < now()` rows (past screenings are
  handled by `db:cleanup-screenings`, not this script).
- A chain's API payload lacks the expected stable id field — derive the
  composite key instead, and note it; do NOT invent ids from array indexes.
- Duplicate-screening creation observed after a sourceId rollout that the
  reconcile doesn't clean — stop that venue's rollout and report.
