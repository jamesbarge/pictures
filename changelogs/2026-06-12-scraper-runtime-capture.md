# Scrapers capture runtime — Rio, ICA, Garden Cinema, Curzon (plan 006)

**PR**: pending
**Date**: 2026-06-12
**Plan**: `plans/006-scraper-metadata-capture.md` (handoff `plans/HANDOFF-2026-06-11.md`)

## Changes

### Runtime capture (the core of the plan)
Plan 005 (PR #670) taught the TMDB matcher to cross-check a venue-provided
runtime against the candidate's TMDB runtime — but zero scrapers emitted one,
even though four already *parsed* it and discarded it. Each now forwards it
onto `RawScreening.runtime`:

- **Rio** (`src/scrapers/cinemas/rio.ts`): the embedded homepage JSON
  (`var Events = {...}`) carries `Event.RunningTime` as a JSON number of
  minutes. Forwarded; the field is typed `number | string` and string values
  are coerced defensively.
- **ICA** (`src/scrapers/cinemas/ica.ts`): the per-film `#colophon` block
  ("…, dir Name, Country Year, NN mins.") was already parsed into a local
  `FilmInfo.runtime`; it now flows through to the pushed screenings.
- **Garden Cinema** (`src/scrapers/cinemas/garden.ts`): the stats line
  ("Greta Gerwig, USA, 2019, 135m.") parser now also extracts runtime — the
  regex requires the `m`/`min`/`mins` unit suffix so the bare 4-digit year
  can never be mistaken for a runtime; only the final comma-separated token
  is parsed, and hour formats ("3h 21m") bail rather than capture the minute
  component as the whole runtime (code-review finding).
- **Curzon** (`src/scrapers/chains/curzon.ts`): the Vista OCAPI film payload's
  `runtimeInMinutes` (already typed on `VistaFilm`) is forwarded for every
  showtime of that film.

### Shared guard
- New `sanitizeRuntime()` in `src/scrapers/utils/metadata-parser.ts`: accepts
  numbers or numeric strings, truncates fractions, and only passes values in
  the sane 1–600 minute band (0/negative = missing-field sentinel; >600 =
  parser noise). All four scrapers route their raw values through it.

### PR #670 reviewer follow-up (a): no duplicate getFilmDetails
- `applyRuntimeCrossCheck` in `src/lib/tmdb/match.ts` fetches the winner's
  TMDB details; `matchAndCreateFromTMDB` then refetched the same details via
  `getFullFilmData`. The match result now carries the fetched details
  (`MatchResult.details`) and `TMDBClient.getFullFilmData` accepts an
  optional `prefetchedDetails` argument, so runtime-verified matches make
  one fewer TMDB call. The client ignores prefetched details whose `id`
  doesn't match the requested tmdbId (code-review hardening), so misuse can
  never mix two films' metadata.

### PR #670 reviewer follow-up (b): NOT done (noted)
- "Stub-reject tries the runner-up candidate" was assessed and skipped:
  `applyRuntimeCrossCheck` only ever sees the single winner; the ranked
  candidate list and the per-candidate confidence math (competition penalty,
  year recovery, classic floor) live inside `findBestMatch`. Retrying the
  runner-up means returning ranked candidates and re-deriving confidence per
  candidate — a structural refactor, not a small well-tested change.

### Plan step 5 (Barbican certificate): skipped per the plan's YAGNI clause
- Barbican strips a trailing BBFC certificate "(12A)" from raw titles.
  `RawScreening` has no certificate field, the matcher does not consume
  certificates, and `films.certification` is filled by TMDB enrichment — so
  even a debug-log capture is a diff with no consumer. Decision recorded in
  `src/scrapers/SCRAPING_PLAYBOOK.md` (Barbican section); revisit only if a
  use case lands.

## Verification

- Unit tests: new `rio.test.ts` (6) and `ica.test.ts` (4); `garden.test.ts`
  +5 (stats-line runtime), `curzon.test.ts` +4 (Vista payload conversion),
  `metadata-parser.test.ts` +7 (`sanitizeRuntime` band), `match.test.ts` +3
  (details pass-through), `film-matching-tmdb.test.ts` +2 (details reuse).
- Live runs (no DB writes): Rio 38/38 films with in-band runtime (JAWS=124,
  RINGU=96 match the venue JSON and canonical runtimes); Garden 88/88 (His
  Girl Friday=92); ICA 19/21 (two films genuinely lack a colophon runtime).
  Curzon verified via fixture tests only — its auth bootstrap needs a headed
  browser locally (Cloudflare), and `runtimeInMinutes` was already confirmed
  in the OCAPI payload during the 2026-06-11 audit.
- Gates: `npm run test:run`, `npm run lint`, `npx tsc --noEmit` all green.

## Impact

- The matcher's runtime signal (stub rejection, −0.15 mismatch penalty) now
  receives real data for four venues — including Curzon's ten London sites —
  instead of never firing.
- Caveat: venue runtimes can include event padding (intros/Q&As, e.g. Rio's
  "film + Q&A" listings). Padding within 30 min is tolerated; larger gaps
  (e.g. Rio's "LITTLE SHOP OF HORRORS + event" = 150 vs the film's 94) draw
  the −0.15 penalty, which strong matches survive. Hints <40 min are ignored
  by design. Backlog (from code review): consider an asymmetric tolerance in
  plan 005 scoring — venue-above-TMDB is usually padding, venue-below-TMDB is
  a strong wrong-film signal.
- No schema changes; purely additive optional metadata. Scrapers without a
  runtime source are unaffected.
