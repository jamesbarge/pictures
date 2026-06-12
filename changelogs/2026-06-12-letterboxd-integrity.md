# Letterboxd Integrity — Stop Guessing, Persist the Canonical Slug

**PR**: pending
**Date**: 2026-06-12
**Plan**: `plans/007-letterboxd-integrity.md`

## Changes

### Schema (migration `0005_motionless_mathemanic.sql`, applied)
- `films.letterboxd_slug` (text) — Letterboxd's canonical film slug, the
  highest-trust identity source. Never guessed.
- `films.letterboxd_enriched_at` (timestamp) — when the rating fetch last
  succeeded; staleness baseline is 1,550 films with a URL but no timestamp.
- Follow-up migration `0006_cooing_sharon_ventura.sql` (single ALTER COLUMN
  → `timestamp with time zone`, matching repo convention; column is
  all-NULL so the ALTER is safe) is generated but **not yet applied** —
  apply with `npm run db:migrate` before/at merge.
- The generated migration also re-emitted `CREATE UNIQUE INDEX
  idx_screenings_cinema_source` (a snapshot-sync artifact: PR #658 declared
  the index in the schema while it was created out-of-band by migration
  0011, which the Drizzle journal does not track). The index was verified to
  already exist in the database and the statement was removed, keeping the
  migration to exactly the two ADD COLUMNs.

### Enrichment (`src/db/enrich-letterboxd.ts`)
- Films with `tmdb_id IS NULL` are skipped (`no_tmdb_anchor`) — for
  event-titled rows the slug guess was garbage ("Doctors Under Attack – Dr
  Ghassan Abu-Sittah Speaks" → `/film/gaza/`). A missing link is correct; a
  wrong link is a bug.
- If `letterboxd_slug` is set, the enricher fetches `/film/{slug}/` directly
  and skips slug-guessing (and the year veto — the slug is identity-exact,
  immune to restoration-year drift).
- On success it persists the canonical slug parsed from the post-redirect
  `response.url`, plus `letterboxd_enriched_at`.

### Fallback enrichment agent (`src/agents/fallback-enrichment/`)
- Letterboxd rating/URL discovery removed entirely. Every film the agent
  processes has `tmdb_id IS NULL` (see `getFilmsNeedingEnrichment`), so any
  Letterboxd identity it produced was a guess. `applyEnrichmentToFilm` no
  longer writes `letterboxdUrl`/`letterboxdRating`. Poster discovery
  (`fetchLetterboxdPoster`) is unchanged.

### Watchlist import (`src/lib/jobs/letterboxd-import.ts`)
- Films created by the background TMDB import now store the entry's
  `data-film-slug` as `letterboxd_slug` and a slug-style `letterboxd_url`.
  Previously Letterboxd's own id was scraped and then discarded.

### Watchlist matching (`src/lib/letterboxd-import.ts`)
- Era-scaled year tolerance: `<1970 → ±3`, `<2000 → ±2`, else `±1`
  (Letterboxd lists restoration years for older films). Gaps >3 years are
  deliberately not covered — the canonical-slug path handles those.
- Entries with no year matching multiple same-titled local films are now
  unmatched instead of taking the first candidate (the "Mary 1931" accident).

### Backfill (`src/scripts/backfill-letterboxd-slugs.ts`, default-dry)
- Phase 1 (no network): parsed slugs out of 1,401 slug-style URLs —
  **executed**; re-run dry shows 0 remaining.
- Phase 2 (network): 149 `/tmdb/{id}` URLs to resolve via Letterboxd's
  redirect with 500ms rate limiting, ±1 year verification (mismatches print
  for review, >10% rate warns of a deeper TMDB-match problem), hard stop on
  403/429. **Not yet executed** — run
  `npx tsx -r tsconfig-paths/register src/scripts/backfill-letterboxd-slugs.ts --execute`.
- Phase 3: staleness report (1,550 films with URL but no enriched-at).

## Impact
- No code path can write a `letterboxd_url` to a film with
  `tmdb_id IS NULL` (write sites: enrichment ✓ guarded, fallback agent ✓
  removed, daily-sweep ✓ already filtered `isNotNull(tmdbId)`,
  film-matching/import job ✓ anchored by construction).
- Wrong-film Letterboxd links ("Nighthawks (1978)" → 1981 Stallone,
  "Projections in Time" → `/film/doctor-who/`) stop being generated;
  existing slugs are now stable identities for future enrichment.
- Restorations/reissues on watchlists match their local films more often
  without creating duplicate rows via the background import.
