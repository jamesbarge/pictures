# TMDB Matcher Signals — Audit Trail, Year Discipline, Runtime/Director/Language

**PR**: pending
**Date**: 2026-06-12
**Plan**: `plans/005-tmdb-matcher-signals.md` (planned at `716e543`)

## Changes

### Bug fix: match audit trail persisted (step 1)
- `matchAndCreateFromTMDB` (`src/scrapers/utils/film-matching.ts`) computed
  `matchConfidence`, `matchStrategy`, `matchedAt`, and `letterboxdUrl` and
  wrote them to the in-memory film cache — but the `db.insert(films)` block
  omitted all four. Only 43 of 685 matched upcoming films (4.3%) had any
  recorded confidence. The insert now mirrors the cache record.

### Year discipline (step 2)
- `scraperYear` is sanitized at the matcher boundary with the same rule
  `createFilmWithoutTMDB` already used: only years `>= 1900 && < currentYear`
  reach `matchFilmToTMDB`. A screening-year hint (indistinguishable from a
  `(YYYY)` title suffix for the current year) previously handed current-year
  junk stubs a +0.2/+0.3 exact-year bonus over the real, older film.

### Runtime cross-check (step 3)
- `MatchHints` gains `runtime?: number`; `RawScreening` gains `runtime?:
  number` (populated by plan 006 — undefined until then, so zero extra API
  calls today).
- After `findBestMatch` picks a winner and a feature-plausible runtime hint
  (>= 40 min) exists, the candidate's TMDB details are fetched once:
  - TMDB runtime < 30 min vs venue runtime >= 60 min → reject (stub/short
    vs feature; TMDB junk stubs have runtime 0/null).
  - Runtimes differing by > 30 min → −0.15 confidence, re-gated on the 0.6
    floor (e.g. Nosferatu 2024's 131 min vs the 1922 original's 97 min).

### Director credit tie-break (step 4)
- When >= 2 candidates score within `competitorThresholdRatio` of the best
  AND a director hint exists, the director is resolved via the existing
  `findDirectorId` / `getPersonCredits` client methods: +0.15 to candidates
  they actually directed, −0.1 to the rest of the tied set, then re-rank.
- Gated to tie situations only — typical matches make zero extra API calls.
  Failures are best-effort (logged warning, match proceeds without the signal).
- `findBestMatch` is now async; its only caller is `matchFilmToTMDB` (verified).

### Venue language prior (step 5)
- `MatchHints` gains `venueLanguages?: string[]`; candidates whose TMDB
  `original_language` matches get +0.05 in scoring — enough to beat the
  popularity bonus (max 0.03) on otherwise-tied candidates. Zero API cost.
- Priors live in `VENUE_LANGUAGE_PRIORS` in `src/config/cinema-registry.ts`
  (the canonical cinema registry). Only `cine-lumiere → ["fr"]` for now;
  a registry test guards that prior keys are real venue ids.

### Hint threading (step 6)
- `pipeline.ts getOrCreateFilm` → `matchAndCreateFromTMDB` gain
  `scraperRuntime` and `venueLanguages` parameters, sourced from
  `rawScreening.runtime` and `VENUE_LANGUAGE_PRIORS[cinemaId]`.

## Tests
- `src/lib/tmdb/match.test.ts` (new): runtime stub-reject / penalty /
  pass-through / floor-reject / API-call gating; director tie-break picks
  the credited director, gate stays tie-only, graceful failure; language
  prior boosts only with a matching venue prior. All TMDB client methods
  mocked — no live API calls.
- `src/scrapers/utils/film-matching-tmdb.test.ts` (new): insert payload
  carries the four audit-trail fields; current-year/future/pre-1900 hints
  stripped, historical years kept; hint threading into `matchFilmToTMDB`.
- `src/config/cinema-registry.test.ts`: `VENUE_LANGUAGE_PRIORS` keys must
  be registered venue ids, values lowercase ISO 639-1.
- No existing test's expected match outcome changed.

## Impact
- Newly matched films now carry a complete audit trail (confidence /
  strategy / matchedAt / letterboxd URL), enabling the weekly wrong-match
  review query planned in the 2026-06-11 audit.
- Wrong-match classes fixed at the matcher level: screening-year stubs
  beating classics ("Cronos"), same-title same-year popularity coin-flips
  ("Dracula" → Besson instead of Radu Jude), docs/stubs colliding with
  features ("Joyland"). Runtime signal activates fully once plan 006 has
  scrapers populate `RawScreening.runtime`.
- Threshold values unchanged — the 0.6 confidence floor is untouched.
