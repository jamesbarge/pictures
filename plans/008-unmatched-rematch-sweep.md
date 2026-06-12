# Plan 008: Re-match sweep for the 306 unmatched films + preventive blocklist + single-source prefix list

> **Executor instructions**: Follow step by step. The sweep script writes to
> production — it MUST be default-dry. Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 716e543..HEAD -- src/lib/tmdb/blocklist.ts src/scrapers/utils/film-title-cleaner.ts src/lib/enrichment-fixtures.ts src/scrapers/utils/film-matching.ts`
> (If `enrichment-fixtures.ts` lives elsewhere, locate via
> `grep -rn "CINEMA_CURATORIAL_PREFIXES" src/ | head -3`.) On drift, compare
> excerpts first.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED (bulk writes; mitigated by dry-run + confidence floor + blocklist)
- **Depends on**: **005 must be landed first** (the sweep should benefit
  from year discipline + audit-trail persistence; running it with the old
  matcher would mass-produce unaudited matches)
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

306 of 993 upcoming films (31%) have no `tmdb_id`, and **nothing ever
retries them** — the pipeline only attempts a match at first sight of a
title. The unmatched set audited 2026-06-11 splits roughly into:

- ~Half **recoverable**: event prefixes ("CAMP CLASSICS presents
  Barbarella", "City Lights presents Bend It Like Beckham"), decoration
  suffixes ("AKIRA (2026 Re-release) (Subbed)", "Boogie Nights (4K
  Restoration)"), and plain titles that match trivially (*Aliens*,
  *Adaptation*, *Autumn Tale*, *Close-Up*).
- The rest: genuine events/quizzes/TV (some misclassified as
  `content_type='film'` — e.g. "BFI Riverfront Closure", a venue notice),
  festival shorts programmes, and genuinely obscure work.

Secondary problems this plan fixes:

1. **Sticky wrong matches**: the per-run film cache returns existing DB rows
   by tmdb_id/title without ever consulting the blocklist, so a wrong id
   already in the DB is served forever (blocklist only filters NEW search
   results).
2. **Two prefix lists**: the title cleaner's regexes and the fixtures'
   `CINEMA_CURATORIAL_PREFIXES` (~74 entries) are maintained separately and
   have drifted.

## Scope

**In scope**: new script `src/scripts/rematch-unmatched-films.ts`;
`src/lib/tmdb/blocklist.ts` (one new export);
`src/scrapers/utils/film-matching.ts` (cache-init blocklist check);
`src/scrapers/utils/film-title-cleaner.ts` (consume the fixtures list);
tests; changelogs.

**Out of scope**: changing the 0.6 confidence floor; reclassifying
content_type in bulk (the sweep may *flag* suspected non-films for review
but only auto-reclassifies titles matching the existing non-film patterns
used by `npm run audit:fix-upcoming`); Letterboxd (007 handles it — but see
sweep step: newly-matched films should get `letterboxd_url =
https://letterboxd.com/tmdb/{id}` consistent with the pipeline).

## Git workflow

Branch `feat/rematch-sweep`; conventional commits; both changelogs;
code-reviewer agent before PR.

## Steps

### Step 1: Single-source the prefix/suffix lists

> **AMENDMENT 2026-06-12**: PR #666 (`3ff5a5f`, "single source for title
> patterns and entity decoding") landed after this plan was written and made
> the extraction pattern module the single source for event prefixes,
> suffixes, non-film patterns, and entity decoding. Before doing ANY of this
> step, read the current `src/scrapers/utils/film-title-cleaner.ts` and
> `src/lib/title-extraction/patterns.ts` / `src/lib/title-patterns.ts`:
> most of this step is likely already done. Keep only the parts still
> missing (verify the decoration-suffix coverage — "(2026 Re-release)",
> "(4K Restoration)", "(Subbed)" — against the new shared module, and the
> `(YYYY)`-capture behavior). The test cases below remain valid as
> acceptance tests regardless of implementation.

In `src/scrapers/utils/film-title-cleaner.ts`, replace any hardcoded prefix
regex list with one generated from the fixtures (locate the canonical
arrays first — `CINEMA_CURATORIAL_PREFIXES` and `TITLE_SUFFIXES_TO_STRIP`):

```ts
import { CINEMA_CURATORIAL_PREFIXES, TITLE_SUFFIXES_TO_STRIP } from "<fixtures module>";

const PREFIX_RE = new RegExp(
  `^(?:${CINEMA_CURATORIAL_PREFIXES.map(escapeRegExp).join("|")})\\s*[:\\-–]\\s*`,
  "i"
);
```

(`escapeRegExp`: check for an existing helper before writing one —
`grep -rn "escapeRegExp\|escape-string-regexp" src/ | head`.)

Add suffix stripping for the decoration patterns confirmed in the unmatched
set — apply iteratively until fixpoint, max 3 passes:

```ts
const DECORATION_SUFFIX_RE =
  /\s*\((?:\d{4}\s+)?re-?release\)|\s*\(4k(?:\s+restoration)?\)|\s*\((?:subbed|dubbed)\)|\s*\(\d{4}\)\s*$/i;
```

IMPORTANT: when stripping a trailing `(YYYY)`, capture it as the year hint
before discarding (pipeline.ts:424-430 already does this — make the cleaner
RETURN `{ cleaned, extractedYear? }` or leave `(YYYY)` intact for the
pipeline to consume; pick whichever the existing call sites make less
invasive, and say which you chose in the PR).

Tests (table-driven): every blocklist "prefix-as-title" historical failure
("The Old Ways: A Century in Sound" must NOT strip — "The Old Ways" is not
in the prefixes list; "CAMP CLASSICS presents Barbarella" → "Barbarella";
"AKIRA (2026 Re-release) (Subbed)" → "AKIRA" + year 2026 → which Step 2 of
plan 005 will then discard as a current/future-year hint — correct, since
2026 is the re-release year, not 1988).

**Commit**: `refactor(titles): single-source curatorial prefixes; strip decoration suffixes`.

### Step 2: Preventive blocklist at cache init

2a. In `src/lib/tmdb/blocklist.ts` add:

```ts
/** TMDB ids recorded as wrong matches; films carrying one need re-matching. */
export function isBlockedTmdbId(id: number): boolean {
  return getBlockedTmdbIds().has(id);
}
```

2b. In `src/scrapers/utils/film-matching.ts` `initFilmCache`, when loading
films: skip adding to `byTmdbId`/`byTitle` any film whose `tmdbId` is
blocked, and log once per run:
`[Pipeline] ${n} cached films carry blocklisted TMDB ids — they will be re-matched on next encounter`.
(Effect: the pipeline treats them as missing → re-runs matching → the
blocklist filters the wrong id from results → either the correct id or no
match. The OLD row stays in the DB; the sweep in Step 3 is what repairs
rows proactively. Do NOT delete or modify rows here.)

Caveat to handle: re-matching may create a NEW film row while screenings
still point at the old one. To avoid duplicate films, the cache-skip must
apply only to `byTmdbId` (so the wrong id can't be *reused*), while
`byTitle` should still return the existing row — otherwise every screening
re-links to a duplicate. Think this through against `lookupFilmInCache`'s
call order in `getOrCreateFilm` (pipeline.ts:459) and write the test before
the code.

Tests: cached film with blocked id is not served by tmdb-id lookup; title
lookup still returns it; non-blocked films unaffected.

**Commit**: `feat(tmdb): blocklisted ids invisible to tmdb-id cache lookups`.

### Step 3: The sweep script

Create `src/scripts/rematch-unmatched-films.ts` — default-dry, `--execute`
to apply, `--limit N` for testing. Algorithm:

```
1. SELECT films f WHERE f.tmdb_id IS NULL
     AND f.content_type = 'film'
     AND EXISTS (SELECT 1 FROM screenings s WHERE s.film_id = f.id AND s.datetime >= now())
2. For each (rate-limit TMDB to ~3 req/s):
   a. cleaned = cleanFilmTitle(f.title)   // now fixture-driven from Step 1
   b. If cleaned matches the audit non-film patterns → flag "suspected_non_film", skip
   c. hints = { year: f.year ?? extracted (YYYY), director: f.directors?.[0] }
      (sanitized per plan 005 year discipline)
   d. match = matchFilmToTMDB(cleaned, hints)
   e. If match (floor 0.6 applies inside) AND no existing film row has that
      tmdb_id → plan: UPDATE the row in place (tmdb_id, year, runtime,
      directors, synopsis, poster_url, letterboxd_url=/tmdb/{id},
      match_confidence, match_strategy='rematch-sweep', matched_at)
   f. If a film WITH that tmdb_id already exists → plan: MERGE
      (repoint screenings to the existing film, delete the empty row) —
      reuse the merge helper from scripts/cleanup-duplicate-films.ts if its
      signature fits; otherwise replicate its screenings-repoint + delete
      logic exactly.
3. Print plan grouped by action: UPDATE / MERGE / SUSPECTED_NON_FILM / NO_MATCH.
```

Dry-run output is the review artifact — eyeball at least the full UPDATE
list before `--execute` (per data-quality workflow). Known sanity anchors
the dry run MUST get right: *Aliens* → tmdb 679; *Adaptation* → 2757;
"CAMP CLASSICS presents Barbarella" → Barbarella (1968). If any anchor
fails, fix before executing.

**Verify after execute**: unmatched-with-upcoming count drops materially
(target <150, from 306); re-run dry → mostly NO_MATCH remainder.

**Commit**: `feat(data): rematch sweep for unmatched films`.

### Step 4: Make the sweep a standing post-scrape phase (wire-up only)

In the unified pipeline script (`src/scripts/run-scrape-and-enrich.ts`),
add an optional phase that runs the sweep in `--execute --limit 100` mode
after enrichment, gated behind env `SCRAPE_REMATCH_SWEEP=1` (default off
until the operator has watched a few manual runs).

**Commit**: `feat(scrape): optional rematch-sweep phase`.

### Step 5: Changelogs, review, PR

Both changelogs; code-reviewer agent; PR.

## Done criteria

- [ ] tsc/lint/test:run green
- [ ] Title-cleaner tests cover the historical prefix failures
- [ ] Dry-run anchors (Aliens/Adaptation/Barbarella) match correctly
- [ ] Executed sweep: unmatched upcoming films <150; every new match has
      match_confidence + match_strategy='rematch-sweep'
- [ ] No duplicate film rows created (check: `SELECT tmdb_id FROM films WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id HAVING count(*)>1` → empty; tmdb_id is UNIQUE so any violation throws earlier)
- [ ] Changelogs + `plans/README.md` updated

## STOP conditions

- Plan 005 is not yet merged (prerequisite).
- The dry run proposes >250 UPDATEs (suspiciously high — review with operator).
- Any sanity anchor mismatches.
- The merge path would delete a film row that still has screenings pointed
  at it (the repoint must verifiably happen first, in one transaction).
- TMDB rate-limit (429) responses — back off; do not hammer.
