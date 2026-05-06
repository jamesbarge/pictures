# Dedupe 413 screening rows + prevent (cinema_id, source_id, datetime) duplicates

**PR**: TBD
**Date**: 2026-05-06
**Branch**: `chore/audit-screening-duplicates`
**Driven by**: Structural issue surfaced during PR #473's Stoma investigation. The Stoma case turned out to be one instance of a much larger 398-triple duplicate problem.

## Why

The `screenings` table's unique index is on `(film_id, cinema_id, datetime)`. `film_id` is the **output** of the matcher — it can change between scrapes. The cinema's `source_id` is the **input** — it's the immutable operational identity of a showing from the cinema's perspective.

When a re-scrape resolves the same `source_id` at the same `datetime` to a different `film_id`, the existing unique index doesn't fire. The pipeline's `INSERT ... ON CONFLICT DO UPDATE` only handles `(film_id, cinema_id, datetime)` conflicts, so the new row is inserted as a fresh duplicate.

This was the root cause of yesterday's Stoma → Guo Ran phantom row, and an audit found it had happened **398 times** across 45 cinemas — Calendar was rendering 413 user-visible doubled screenings.

## Investigation findings

```sql
SELECT COUNT(*) AS dup_triples,
       SUM(rows - 1) AS excess_rows,
       SUM(CASE WHEN distinct_films > 1 THEN 1 ELSE 0 END) AS film_mismatches
FROM (
  SELECT cinema_id, source_id, datetime, COUNT(*) AS rows, COUNT(DISTINCT film_id) AS distinct_films
  FROM screenings WHERE source_id IS NOT NULL
  GROUP BY cinema_id, source_id, datetime
  HAVING COUNT(*) > 1
) dupes;
```

Pre-fix:
- **398 duplicate triples**, **813 rows in dups**, **413 excess**
- **All 398 had a film mismatch** (no benign duplicates)
- **387 were future-dated** (still on the calendar), 11 past
- **45 cinemas affected** — biggest offenders: Prince Charles (45 excess), Genesis (34), Garden (33), ICA (27), Ritzy Brixton (18)

## Pattern shapes observed

1. **Matcher-improvement orphans**: pre-PR-#472 LLM classifications produced wrong film_ids; PR #472's deterministic classifiers got it right but inserted fresh rows.
2. **Event-prefix instability**: scrapers sometimes preserve "Throwback:" / "Film Club:" / "DocHouse:" / "Member Picks:" / "MET Opera Encore:" prefixes, sometimes strip them; the same `source_id` resolves differently across scrapes.
3. **Title-language drift**: Curzon "Our Land" vs "DocHouse: Our Land", Cine Lumière "Queen Margot" vs "La Reine Margot".
4. **Null vs valued years**: same film resolved as `(year=null)` and `(year=1986)` across scrapes.

## Changes

### Code (preventative)

- **`src/scrapers/utils/screening-classification.ts`** — `checkForDuplicate` adds Layer 0: lookup by `(cinemaId, sourceId, datetime)` regardless of `filmId`. Returns the existing row so the caller can update its `filmId`.
- **`src/scrapers/pipeline.ts`** — passes `screening.sourceId` to `checkForDuplicate`. The UPDATE path now sets `filmId` in the SET clause, so source_id-matched rows whose previous resolution was wrong get healed automatically on the next scrape.

The function signature change is backward-compatible (`sourceId` is an optional param). Existing call sites that don't pass it get the original three-layer behavior.

### Data (curative)

- **`scripts/audit-screening-duplicates.ts`** — read-only audit script. Reports counts by cinema, past/future split, NULL source_id audit, and the top-N worst offenders with film titles + scraped_at + trigram similarity.
- **`scripts/dedupe-screening-source-id-duplicates.ts`** — winner-selection algorithm with four tiers:
  - **Tier 1**: top row's pg_trgm similarity beats the runner-up's by ≥0.10 (66 triples)
  - **Tier 2**: trigram tied; year-non-null beats year-null (250 triples)
  - **Tier 3**: trigram + year tied; most-recent `scraped_at` wins (82 triples)
  - **Tier 4**: everything tied; lexicographically largest id (0 triples — no truly arbitrary ties)
- Dry-run by default; `--apply` commits. Already executed during this work.

### Tier 2 picks — known tradeoff

The 250 Tier-2 cases keep the higher-trigram row, which is often the more verbose event-decorated title (e.g. "Throwback: Top Gun (40th Anniversary)" over the canonical TMDB-matched "Top Gun" 1986). This is suboptimal for film metadata richness, but **the new code path makes it self-healing**: future scrapes find the row by `source_id`, the matcher (with PR #472's deterministic classifiers) re-resolves to the better candidate, and the row's `film_id` updates in place — no new duplicates accumulate.

Net: the calendar shows one row per `(cinemaId, sourceId, datetime)` immediately, and the per-row film-quality drift heals over the coming scrape passes.

## Verification

```
Pre-apply:  398 duplicate triples,  813 rows in dups,  413 excess
Post-apply:   0 duplicate triples
Total rows:  9,218 (8,514 future)
```

- `npm run test:run` — **887 / 887 passing**
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors, 42 warnings (all pre-existing)

The two FK references to `screenings.id` (festival_screenings, plus one other festival join table) both have `ON DELETE CASCADE`, so the 413 deletions cleanly cascade. Festival linkages are re-established on every scrape via `linkScreeningToFestival`.

## Impact

- **Calendar no longer shows doubled screenings** for the 387 future cases that were previously visible.
- **Future re-scrapes are stable** — the same `source_id` always finds the same row and updates it in place.
- **Verbose-title-keep cases self-heal** as PR #472's deterministic matcher continues to improve the `film_id` resolution on each scrape pass.

## Out of scope (deliberately)

- **Add `uniqueIndex(cinemaId, sourceId, datetime)` at the schema level.** Defense in depth, but the application-layer prevention covers the common case (sequential same-source-id scrapes). The schema constraint also has a known edge case: if a matcher-flip causes a row to update from `filmId=A` → `filmId=B` and another row at the same `(cinema, time)` already has `filmId=B`, the existing `(film_id, cinema_id, datetime)` unique index would reject the update. Worth doing in a follow-up after observing the deployed code's behavior under the next ~7 days of cron.
- **Address the systemic title-quality drift** (verbose vs canonical). That's a matcher / title-cleaning problem, not a dedup problem.
- **Past 11 duplicate triples** were also deduped (no special handling) — they'd otherwise stay in the DB indefinitely as historical clutter.
