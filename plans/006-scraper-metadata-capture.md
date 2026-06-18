# Plan 006: Capture runtime (and other already-parsed metadata) in scrapers and carry it to the matcher

> **Executor instructions**: Follow step by step; verify each scraper change
> against the venue's live site output. Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 716e543..HEAD -- src/scrapers/types.ts src/scrapers/cinemas/rio.ts src/scrapers/cinemas/ica.ts src/scrapers/cinemas/barbican.ts src/scrapers/chains/curzon.ts`
> On drift in any in-scope file, compare excerpts before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive optional fields; no behavior change until 005 consumes them)
- **Depends on**: 005 Step 3a (the `RawScreening.runtime` field) — if 005 has
  not landed, add the field here instead (identical one-liner, coordinate to
  avoid conflict)
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

Plan 005 teaches the matcher to use runtime — but today **zero scrapers
capture it**, even though four of them already *parse* it and throw it away:

- **Rio**: embedded JSON `Event.RunningTime: number` is in the scraper's own
  interface (`src/scrapers/cinemas/rio.ts:26`) and never read.
- **ICA**: fetches a detail page per film and extracts runtime from the
  `#colophon` block into a local `FilmInfo.runtime`, then forwards only
  year + director.
- **Garden Cinema**: parses a "Director, Country, Year, Runtime" stats line;
  forwards only year + director.
- **Curzon**: the Vista OCAPI film payload includes `runtimeInMinutes`
  (and synopsis); the scraper keeps only title + datetime.

Also: Barbican parses titles with a trailing BBFC certificate `"(12A)"` and
strips it without keeping it; `films.certification` exists in the schema.

## Scope

**In scope**: `src/scrapers/types.ts` (only if 005 hasn't added `runtime`),
`src/scrapers/cinemas/rio.ts`, `src/scrapers/cinemas/ica.ts`, the Garden
Cinema scraper (find exact filename via `ls src/scrapers/cinemas/ | grep -i garden`),
`src/scrapers/chains/curzon.ts`, `src/scrapers/cinemas/barbican.ts`,
`src/scrapers/SCRAPING_PLAYBOOK.md` (mandatory update per repo rule),
scraper test files, changelogs.

**Out of scope**: the matcher (005); a shared detail-page fetch helper for
the 20 metadata-blind scrapers (deliberately deferred — bigger lift, see
"Maintenance notes"); Picturehouse/Everyman (runtime not exposed in their
current API responses — verified 2026-06-11).

## Git workflow

Branch `feat/scraper-runtime-capture`; conventional commits; both
changelogs; code-reviewer agent before PR (3+ files).

## Steps

### Step 1: Rio — forward the parsed runtime (1 line + test)

In `src/scrapers/cinemas/rio.ts`, where screenings are pushed (~line 136):

```ts
        year: event.Year ? parseInt(event.Year, 10) : undefined,
        director: event.Director || undefined,
        runtime: event.RunningTime || undefined,   // ← add
```

Guard: only accept `RunningTime` in a sane band, 1–600. If the JSON value is
a string in practice, coerce with `parseInt` and test both shapes.

**Verify**: `npx vitest run src/scrapers/cinemas/rio*` (extend the existing
test fixture with a RunningTime value, assert it lands on the RawScreening).
Then live-check: `/scrape-one rio-dalston` style single-venue run, or
`npx tsx`-eval the scraper directly, and confirm a known film's runtime
matches the Rio site.

### Step 2: ICA — forward the already-extracted runtime

In `src/scrapers/cinemas/ica.ts`: `FilmInfo` already holds
`runtime` (parsed from the colophon, ~line 127–140). Find where screenings
are pushed with `year`/`director` (~line 193–203) and add
`runtime: info.runtime`.

**Verify**: scraper unit test with a colophon fixture; assert runtime flows
through.

### Step 3: Garden Cinema — same pattern

Locate the stats-line parse (it produces director/country/year/runtime; the
parse already exists). Forward `runtime` onto the pushed RawScreening.

**Verify**: unit test with a stats-line fixture.

### Step 4: Curzon — forward `runtimeInMinutes` from the Vista film payload

In `src/scrapers/chains/curzon.ts`, the film objects fetched from OCAPI
include `runtimeInMinutes`. Thread it onto each pushed screening for that
film: `runtime: vistaFilm.runtimeInMinutes || undefined`. (Type the field on
the existing VistaFilm interface if absent.)

**Verify**: unit test with a captured API fixture (there should be one
already for curzon; extend it).

### Step 5: Barbican — keep the certificate

In `src/scrapers/cinemas/barbican.ts` (~line 110–135) the BBFC rating is
stripped from the raw title. Capture before stripping:

```ts
const certMatch = rawTitle.match(/\((U|PG|12A?|15|18)\)\s*$/);
const certificate = certMatch ? certMatch[1] : undefined;
```

`RawScreening` has no certificate field and `films.certification` is filled
by TMDB enrichment anyway — so do NOT add a pass-through field in this plan.
Instead just stop *losing* it: log it at debug level and leave a TODO
referencing this plan. (YAGNI: the matcher doesn't consume certificates;
revisit only if a use case lands.) If you judge even this not worth a diff,
skip Step 5 entirely and note the decision in the PR description — that is
an acceptable outcome.

### Step 6: Playbook + changelogs

Update `src/scrapers/SCRAPING_PLAYBOOK.md` (mandatory on any scraper
change): document for each touched scraper where runtime comes from and its
observed format. Update both changelog locations.

## Test plan

- Unit: each touched scraper's test gains a fixture asserting
  `runtime` on the emitted RawScreening (Rio JSON number; ICA colophon text;
  Garden stats line; Curzon API field).
- Integration: one single-venue live run per scraper (Rio is the fastest);
  pick a film, cross-check runtime against the venue website ±2 min.
- Regression: `npm run test:run` all green; no scraper emits runtime
  outside 1–600.

## Done criteria

- [ ] 4 scrapers emit `runtime`; values verified against live sites
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run test:run` green
- [ ] SCRAPING_PLAYBOOK.md updated for all touched scrapers
- [ ] Changelogs + `plans/README.md` updated

## STOP conditions

- A venue's payload shape differs from the excerpts (e.g. Rio's
  `RunningTime` no longer exists) — re-derive from a live fetch, and if the
  source has materially changed, report instead of guessing.
- Adding the field breaks the screenings upsert typecheck anywhere outside
  the in-scope files.

## Maintenance notes

- The big follow-on (deliberately not in this plan): a shared
  `detail-page-fetcher.ts` so BFI/Barbican/Everyman can fetch per-film
  detail pages the way ICA does, with per-film caching. Spec it only after
  005+006 prove runtime moves match accuracy.
- Everyman exposes `api/gatsby-source-boxofficeapi/movies?ids=...` which
  may include runtime — worth a probe when someone is next in that scraper.
