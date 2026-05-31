# Search — people search + /people/[name] director & actor pages

**PR**: TBD
**Date**: 2026-05-31

## Changes
### Backend
- `src/app/api/films/search/route.ts` — added a `people[]` group to the response:
  distinct director names with upcoming screenings whose name matches the query
  (ILIKE substring OR pg_trgm). Mirrors the `/api/directors` `unnest(directors)`
  pattern; bounded by the ~1k upcoming-films candidate set. Ordered exact →
  prefix → film-count. Added `people: []` to browse/short-query/error responses.
- `src/app/api/people/[name]/route.ts` (new) — `GET /api/people/:name` returns a
  person's upcoming films where they are a director (`name = ANY(directors)`) OR
  in the cast (`cast @> [{"name": ...}]::jsonb`), joined to future screenings,
  with `isDirector`/`isCast` role flags, `nextScreeningAt`, `screeningCount`.
  `GROUP BY f.id` (PK) for functional-dependency column selection. 404 if none.

### Frontend
- `result-types.ts` — `PersonResult` kind + `people` section (after films) + label.
- `rows/PersonRow.svelte` (new) — person row (glyph + name + "Director · N films").
- `ResultsList.svelte` — dispatch the `people` section to `PersonRow`.
- `stores/palette.svelte.ts` — map `people` from the response; `person` activation
  case navigates to `/people/[name]` (Enter / Cmd-Enter new tab).
- `seo/json-ld.ts` — `personSchema(name, roles, filmTitles)` (Schema.org Person).
- `routes/people/[name]/+page.{server.ts,svelte}` (new) — ISR page, sectioned
  **As Director** / **On Screen**, responsive poster grid, Person + Breadcrumb
  JSON-LD, canonical URL.
- `routes/directors/+page.svelte` — director cards now link to `/people/[name]`.

## Verification
- `scripts/verify-people-search.ts` (read-only, prod DB): surname search surfaces
  the full name; typo tolerance ("Scorses" → Scorsese); person-films query returns
  role-flagged rows. Top directors (Scorsese/Spielberg/Lynch/Nolan/PTA) confirmed.
- `svelte-check`: 0 errors (2 pre-existing unrelated warnings). `tsc --noEmit`:
  no errors in changed files.
- Browser verification: against the Vercel preview (local backend node_modules is
  corrupted in this checkout — a pre-existing env issue, unrelated; CI installs fresh).

## Impact
- Users can search for a director and land on a page of their current London
  showings — a discovery axis that did not exist (the `/directors` list linked
  nowhere). Indexable person pages add long-tail organic search surface.
- v1 search-results PEOPLE group is directors-only (actor-name search in results
  deferred to keep the per-keystroke endpoint off a jsonb-unnest hot path); the
  person page itself surfaces both director and cast credits.
