# cmd+k search foundation — DB migration + a11y mark fix

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step1-db-migration`

## Context

Step 1 of the 10-step plan in `tasks/cmdk-palette-plan.md` to ship a global cmd+k command palette. This step lays the database foundation — Postgres FTS + pg_trgm + unaccent + weighted tsvector generated columns + GIN indexes — that the new `/api/films/search` endpoint will use in step 2 for Reciprocal Rank Fusion (k=60) over all queryable properties.

Also fixes a pre-existing WCAG 1.4.1 violation in the existing inline `SearchInput.svelte` `<mark>` highlight styling.

## Constraints

- FOSS-only. No paid services, no new AI API keys (per [[feedback-no-paid-or-ai-apis]]).
- Migration **NOT YET APPLIED** to production Supabase. Pending explicit ship approval per `CLAUDE.md` deployment gate ("ship it"/"deploy"/"push to prod"/"go live").

## Changes

### New: `src/db/migrations/0012_search_layer.sql`
- Enables 3 extensions: `unaccent`, `pg_trgm`, `btree_gin`.
- Creates custom `pictures` text search configuration based on `english` with `unaccent` wired into the `hword`, `hword_part`, `word` mappings.
- Adds GENERATED STORED columns:
  - `films.search_tsv` (weighted A: title+original_title, B: directors + cast jsonb names, C: genres+countries+languages, D: synopsis+tagline)
  - `films.search_text` (lower+unaccent flat string for trigram)
  - `cinemas.search_tsv` (A: name+short_name, B: chain, C: address jsonb area+postcode+street, D: description)
  - `cinemas.search_text`
  - `screenings.search_tsv` (B-weight metadata: format, screen, season, event_type, event_description, subtitle_language)
  - `festivals.search_tsv` (A: name+short_name, B: description, C: genre_focus)
  - `seasons.search_tsv` (A: name+director_name, B: description)
- Cast jsonb extraction uses `ARRAY(SELECT jsonb_array_elements_text(jsonb_path_query_array(cast, '$[*].name')))` — the only IMMUTABLE-safe expression PG ≤16 accepts inside a generated column.
- 7 GIN indexes (tsvector + trigram).
- 4 compound btree indexes: `films(is_repertory, year DESC)`, `films(content_type, year DESC)`, partial `films(decade)`, partial `screenings(film_id, datetime) WHERE datetime > now()`.

### New: `scripts/verify-search-migration.ts`
14 checks runnable post-migration via `npx tsx scripts/verify-search-migration.ts`. Tests extensions, custom config, generated columns on all 5 tables, all 11 indexes present, unaccent behaviour, trigram fuzzy match, jsonb cast extraction sanity, address jsonb extraction. Handles both Drizzle/postgres.js array-direct and node-postgres `.rows` shapes per project convention.

### Modified: `src/db/schema/{films,cinemas,screenings,festivals,seasons}.ts`
Documentation-only comments pointing to migration 0012. The generated columns are intentionally NOT declared in Drizzle schema because Drizzle 0.45's generated-column type exclusion leaks them into the inferred `FilmInsert` shape, breaking two existing callsites in `src/scrapers/utils/film-matching.ts`. The columns are queried via raw `sql\`...\`` in the new search endpoint (coming in step 2).

### Modified: `frontend/src/lib/components/filters/SearchInput.svelte`
`.result-row mark` style now includes `text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px;` in addition to `font-weight: 600`. The previous bold-only treatment violated WCAG 1.4.1 Use of Color for users who cannot perceive weight differences. This affects every existing inline search highlight on the calendar, not only the new palette.

### New: `tasks/cmdk-palette-plan.md`
The full 10-step implementation plan, synthesised from 5 specialist agent reports (visual design, database, frontend, performance, accessibility). 370 lines covering property coverage matrix, file tree, migration DDL, RRF query design, query parser grammar, runes state, Orama client index, keyboard map, a11y checklist, latency budgets, and the 10-step sequence.

## Impact

- **Performance**: Lays groundwork for ~25ms parallel-query p95 (films + cinemas + screenings + festivals + seasons fanned out via `Promise.all`) at production volume (20k films, 200k upcoming screenings, 60 cinemas).
- **A11y**: SearchInput mark highlight now meets WCAG 1.4.1.
- **Reversibility**: Migration uses `IF NOT EXISTS` throughout; safe to re-run. Rollback path documented in `tasks/cmdk-palette-plan.md` §11.
- **Risk**: Low. The migration only adds columns and indexes; no existing data mutated. Generated columns are computed lazily on row write. Existing `idx_films_title` btree stays — it still serves prefix-ILIKE queries elsewhere in the codebase.

## Verification (post-deploy)

```bash
# 1. Apply migration via Supabase SQL Editor or psql with DATABASE_URL
# 2. Verify
npx tsx scripts/verify-search-migration.ts
# Expect: All 14 checks passed.

# 3. Type & lint gates
npm run lint
npx tsc --noEmit
cd frontend && npx svelte-check --tsconfig ./tsconfig.json
```

Step 2 (RRF query in `/api/films/search`) will land in a follow-up branch.
