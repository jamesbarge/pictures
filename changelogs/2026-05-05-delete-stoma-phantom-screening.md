# Delete phantom Stoma screening + surface broader (cinema, source_id) duplicate issue

**PR**: TBD
**Date**: 2026-05-05
**Branch**: `chore/delete-stoma-phantom-screening`
**Driven by**: Suspect merge surfaced by `scripts/unmerge-bad-films.ts` audit on 2026-05-04 (`Stoma → Guo Ran` at 0.016 trigram). Investigated tonight after PR #472 merged.

## Why

Yesterday's audit query (in `scripts/unmerge-bad-films.ts`) reported a Garden screening whose `source_id` contained `stoma` but whose linked film was `Guo Ran (2025)`, with a trigram similarity of 0.016 — well below any matcher threshold. PR #472's matcher hardening could not have caused or prevented this. We deferred the investigation to tonight.

## Investigation findings

### The Stoma-specific bug

Two distinct screening rows shared the same `(cinema_id, source_id, datetime)` for Garden's 2026-05-17 18:00 showing of Stoma:

| screening id | source_id | scraped_at | film | trigram sim |
|---|---|---|---|---|
| `cbcdfce0` | `garden-remind-film-festival-presents-stoma-...` | 2026-04-29 06:54 | Guo Ran (2025) ❌ | 0.016 |
| `4257ddb6` | `garden-remind-film-festival-presents-stoma-...` | 2026-05-05 06:08 | Stoma (2020) ✅ | 0.111 |

The 2026-04-29 scrape resolved to Guo Ran. The 2026-05-05 scrape (today) correctly resolved to Stoma — but it inserted a NEW row instead of updating the old one. Garden never actually scheduled Guo Ran at that slot; the row is a phantom from the older scrape.

Why did the 04-29 scrape pick Guo Ran? Pre-PR #472 the `/scrape` pipeline also routed through Gemini-based classifiers, so the wrong link likely came from a non-deterministic LLM extraction or a bad fallback path that no longer exists in the codebase. The new pipeline is deterministic and would not reproduce the misclassification.

### The broader bug

The actual root cause of the duplicate-row pattern is structural:

```
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'screenings'::regclass AND contype IN ('u', 'p');
```

returns just the primary key on `id`. There is no unique constraint on `(cinema_id, source_id)` or `(cinema_id, source_id, datetime)`. The scraper's "upsert" is therefore an insert-only path — every re-scrape that resolves the film_id differently can produce a new row.

The same audit surfaced 20+ collisions across Picturehouse, Rio, PCC, Everyman, ICA, Curzon, Garden:

| cinema | source_id | rows | distinct films |
|---|---|---|---|
| ritzy-brixton | picturehouse-ritzy-brixton-71392 | 3 | 3 |
| rio-dalston | rio-dalston-2239065-... | 3 | 3 |
| prince-charles | 31626132 | 3 | 3 |
| everyman-barnet | everyman-everyman-barnet-1000021612-... | 3 | 3 |
| ica | ica-the-machine-that-kills-bad-people-... | 3 | 3 |
| arthouse-crouch-end | arthouse-nt-live:-les-liaisons-dangereuses-... | 3 | 3 |
| ... (14 more with 2 rows / 2 films) |

These very likely render as doubled screenings on the public calendar. **Out of scope for this PR**; logged as a follow-up.

## Changes

- **`scripts/delete-stoma-phantom.ts`**: one-shot deletion script with four pre-flight guards (target id match, target film_title='Guo Ran', source_id contains 'stoma', sibling row linked to film_title='Stoma'). Dry-run by default; `--apply` to commit. Idempotent (no-op if the row is already deleted).

## Verification

After running with `--apply`:

```
=== Garden screenings with source_id containing 'stoma' ===
1 row remaining: 4257ddb6 → Stoma (2020) at 2026-05-17 18:00 ✓

=== All Garden screenings linked to Guo Ran ===
1 row remaining: 210e5b41 → garden-remind-film-festival-presents-guo-ran-2026-05-09T17:00:00.000Z ✓
(the 2026-05-09 17:00 Guo Ran screening, correctly linked)
```

No code changes; tsc + lint + tests baseline preserved (887/887 from PR #472).

## Impact

- **Garden's 2026-05-17 18:00 Stoma screening** now appears once on the calendar, correctly attributed to Stoma (2020).
- **Guo Ran's listing** is no longer polluted with a phantom 2026-05-17 18:00 entry.
- **Broader duplicate issue surfaced** for separate handling — the lack of `(cinema_id, source_id)` unique constraint affects 20+ known collisions and likely many more we haven't audited yet.

## Out of scope (deliberately)

- **Add a unique constraint on `screenings(cinema_id, source_id)` or `(cinema_id, source_id, datetime)`** — needs analysis of which (cinema, source_id) shapes are actually keys, plus a backfill plan to dedupe existing rows before the constraint can be added. Separate PR.
- **Sweep the other 20+ duplicate triples** — same analysis applies; pick a winning row per triple based on `scraped_at` / film-title-vs-source-id similarity.
- **Investigate why the 2026-04-29 scrape picked Guo Ran** — pre-PR #472 codepath that no longer exists; not worth deep-diving.
