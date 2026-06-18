# Plan 005: TMDB matcher — persist the audit trail, enforce year discipline, add runtime/director/language signals

> **Executor instructions**: Follow step by step. Run every verification
> command before moving on. On any STOP condition, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 716e543..HEAD -- src/lib/tmdb/match.ts src/lib/tmdb/client.ts src/scrapers/utils/film-matching.ts src/scrapers/pipeline.ts`
> If any in-scope file changed since planning, compare the "Current state"
> excerpts below against live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (changes match outcomes; guarded by tests + confidence floor)
- **Depends on**: none (006 makes its signals *richer* but is not required)
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

Production has confirmed wrong matches (*Joyland* → a Kansas amusement-park
doc; *Persepolis* → the archaeological site) and 39 documented historical
failures in `.claude/data-check-learnings.json`. Root causes, verified in
source on 2026-06-11:

1. The films INSERT **silently drops** `matchConfidence`/`matchStrategy`/
   `matchedAt`/`letterboxdUrl` (computed, added to the in-memory cache, never
   persisted) — only 4.3% of matched films have an audit trail.
2. Year hints can be the *screening* year, handing 2026 junk stubs a +0.3
   exact-year bonus over the real (older) film.
3. The matcher never looks at `runtime` or `original_language`, and the
   director hint never reaches search or scoring — despite
   `client.findDirectorId()` / `getPersonCredits()` already existing unused.

## Current state (verified excerpts)

- `src/lib/tmdb/match.ts:51-56` — `MatchHints { year?, director?, skipAmbiguityCheck? }`.
- `src/lib/tmdb/match.ts:58-64` — `MatchResult { tmdbId, confidence, title, year, posterPath }`.
- `src/lib/tmdb/match.ts:165` — `const searchResults = await client.searchFilms(title, hints?.year);`
  — director never passed; no post-search candidate detail fetch.
- `src/lib/tmdb/match.ts` — scoring in `findBestMatch()`:
  `titleSimilarity × 0.7 + yearBonus(≤0.3) + popularityBonus(≤0.03) − competitorPenalty(≤0.15)`,
  gate `finalConfidence >= tmdb.minMatchConfidence` (0.6 via
  `src/lib/data-quality/thresholds.json`; safety floor 0.6 — do NOT lower).
- `src/lib/tmdb/client.ts:55-60` `searchFilms(query, year?)`; `:66`
  `getFilmDetails(tmdbId): Promise<TMDBMovieDetails>` (includes `runtime`);
  `:179` `findDirectorId(name)`; `:203` `getDirectorData(personId)`.
- `src/scrapers/utils/film-matching.ts` — `matchAndCreateFromTMDB(cache,
  matchingTitle, scraperYear?, scraperDirector?, scraperPosterUrl?)`. The
  `db.insert(films).values({...})` block sets id/tmdbId/title/year/runtime/…
  but NOT matchConfidence/matchStrategy/matchedAt/letterboxdUrl. The
  `addToFilmCache` call right after it DOES set all four (lines ~270-280:
  `letterboxdUrl: \`https://letterboxd.com/tmdb/${match.tmdbId}\`,
  matchConfidence: match.confidence ?? null, matchStrategy: "auto-with-year",
  matchedAt: new Date()`).
- `src/scrapers/utils/film-matching.ts` — `createFilmWithoutTMDB` already
  sanitizes screening-year contamination (accept only `>= 1900 && < currentYear`).
  The TMDB path has no equivalent guard.
- `src/scrapers/pipeline.ts:424-430` — extracts a `(YYYY)` suffix from the
  title as a year hint when the scraper provided none (this IS a release
  year; keep it).
- Blocklist: `src/lib/tmdb/blocklist.ts` filters known-wrong ids from
  search results (reactive only — preventive mode is plan 008).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | no NEW errors under `src/` |
| Scoped tests | `npx vitest run src/lib/tmdb/` | all pass |
| Full tests | `npm run test:run` | all pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**: `src/lib/tmdb/match.ts`, `src/lib/tmdb/client.ts` (read
mostly), `src/lib/tmdb/match.test.ts` (extend/create),
`src/scrapers/utils/film-matching.ts`, `src/scrapers/pipeline.ts` (hint
threading only), `src/scrapers/types.ts` (one optional field), changelogs.

**Out of scope**: thresholds.json values (0.6 floor is non-negotiable);
individual scrapers (plan 006); blocklist preventive mode (plan 008);
Letterboxd files (plan 007).

## Git workflow

Branch `feat/tmdb-matcher-signals`; conventional commits; both changelogs;
PR touches 3+ files so run the code-reviewer agent on the diff before
opening the PR. Do not merge without operator approval ("ship it").

## Steps

### Step 1 (the bug fix): persist the match audit trail

In `matchAndCreateFromTMDB`, add the four missing fields to the
`db.insert(films).values({...})` block, mirroring the cache-add below it:

```ts
    letterboxdUrl: `https://letterboxd.com/tmdb/${match.tmdbId}`,
    matchConfidence: match.confidence ?? null,
    matchStrategy: "auto-with-year",
    matchedAt: new Date(),
```

Write a test first (vitest, mock db like
`src/scrapers/utils/film-matching-cache.test.ts` does): assert the insert
payload contains `matchConfidence` equal to the mocked match confidence.

**Verify**: scoped tests pass. Commit:
`fix(tmdb): persist matchConfidence/strategy/matchedAt/letterboxdUrl on film insert`.

### Step 2: year discipline at the matcher boundary

In `matchAndCreateFromTMDB`, sanitize `scraperYear` with the SAME rule
`createFilmWithoutTMDB` already uses, BEFORE calling `matchFilmToTMDB`:

```ts
const currentYear = new Date().getFullYear();
const releaseYearHint =
  scraperYear && scraperYear >= 1900 && scraperYear < currentYear
    ? scraperYear
    : undefined;
const match = await matchFilmToTMDB(matchingTitle, {
  year: releaseYearHint,
  director: scraperDirector,
});
```

Rationale: a `(YYYY)` parsed from the title (pipeline.ts:426) for the
current year is indistinguishable from screening-year pollution; losing the
hint costs a +0.2 bonus, while keeping a wrong one *selects the wrong film*.
Tests: hint 2026 (current year) → matcher called with `year: undefined`;
hint 1972 → passed through.

**Verify + commit**: `fix(tmdb): never pass current-year hints to matching`.

### Step 3: runtime cross-check of top candidates

3a. Add to `MatchHints`: `runtime?: number;` (minutes). Add to
`RawScreening` in `src/scrapers/types.ts`:

```ts
  /** Film runtime in minutes (if available from source) */
  runtime?: number;
```

3b. In `matchFilmToTMDB` after `findBestMatch` returns a candidate AND
`hints.runtime` is present, fetch `client.getFilmDetails(result.tmdbId)`
and apply:

```ts
if (hints?.runtime && hints.runtime >= 40) {
  const details = await client.getFilmDetails(best.tmdbId);
  const tmdbRuntime = details.runtime ?? 0;
  if (tmdbRuntime > 0) {
    const diff = Math.abs(tmdbRuntime - hints.runtime);
    if (tmdbRuntime < 30 && hints.runtime >= 60) return null;      // stub/short vs feature
    if (diff > 30) best.confidence = Math.max(0, best.confidence - 0.15);
    if (best.confidence < tmdb.minMatchConfidence) return null;
  }
}
```

Mock `getFilmDetails` in tests. Cases: stub runtime 0/12 vs hint 100 →
reject; 97 vs hint 100 → unchanged; 131 vs hint 97 (Nosferatu 2024 vs 1922)
→ −0.15. Keep the extra API call gated on `hints.runtime` so cost is zero
until plan 006 populates it.

**Verify + commit**: `feat(tmdb): runtime cross-check for match candidates`.

### Step 4: use the director hint in scoring

In `findBestMatch`, when `hints.director` is set and ≥2 candidates score
within `competitorThresholdRatio` of the best, resolve via the existing
client machinery:

```ts
const directorId = await client.findDirectorId(hints.director);
if (directorId) {
  const credits = await client.getPersonCredits(directorId);
  const directedIds = new Set(
    credits.crew.filter((c) => c.job === "Director").map((c) => c.id)
  );
  // +0.15 to candidates the director actually directed; −0.1 to others
}
```

NOTE: `findBestMatch` is currently sync — this requires making it async (it
is only called from `matchFilmToTMDB`, which is already async; update the
one call site and any tests). Normalize the director name for comparison
(lowercase, strip accents — reuse the existing normalize helper in match.ts).
Tests: "Dracula" with director "Radu Jude" picks the Jude film over the
higher-popularity Besson when both tie on title+year.

**Verify + commit**: `feat(tmdb): director credit check breaks candidate ties`.

### Step 5: venue original-language prior (zero API cost)

5a. `MatchHints` gains `venueLanguages?: string[]`.
5b. In `findBestMatch` scoring: `if (hints?.venueLanguages?.includes(result.original_language)) score += 0.05;`
5c. Add a small static map in `src/scrapers/utils/film-matching.ts`
(threaded from pipeline; check `src/config/` for an existing cinema
registry first and put it there if one exists):

```ts
const VENUE_LANGUAGE_PRIORS: Record<string, string[]> = {
  "cine-lumiere": ["fr"],
  "goethe-institut": ["de"],   // include only ids that exist in the registry
};
```

Only add venues you can verify in the cinema registry. Tests: fr candidate
beats an otherwise-tied en candidate at cine-lumiere; no effect elsewhere.

**Verify + commit**: `feat(tmdb): venue language prior in match scoring`.

### Step 6: thread hints through the pipeline

Update the chain: `pipeline.ts` `getOrCreateFilm` → `matchAndCreateFromTMDB`
gains `scraperRuntime?: number` and `venueLanguages?: string[]` parameters →
passed into `matchFilmToTMDB` hints. Source `scraperRuntime` from
`rawScreening.runtime` (populated by plan 006; safe to thread now — it's
simply undefined until then) and `venueLanguages` from the prior map keyed
by `cinema.id`.

**Verify**: `npx tsc --noEmit`, full `npm run test:run`, `npm run lint`.
Commit: `feat(scrape): thread runtime + venue language hints to TMDB matcher`.

### Step 7: changelogs + review

Both changelog locations; run the code-reviewer agent on the full diff;
fix findings; open PR.

## Test plan (summary)

All in `src/lib/tmdb/match.test.ts` + `src/scrapers/utils/film-matching` tests,
mocking `TMDBClient` methods (`searchFilms`, `getFilmDetails`,
`findDirectorId`, `getPersonCredits`) with `vi.mock`:

1. insert payload carries the four audit-trail fields (Step 1)
2. current-year hint stripped; historical year kept (Step 2)
3. runtime: stub-reject / penalty / pass-through (Step 3)
4. director tie-break picks the credited director (Step 4)
5. language prior boosts only at mapped venues (Step 5)
6. regression: existing match.test.ts cases still pass unchanged —
   if any existing expected match flips, treat as a STOP condition and
   analyse before adjusting the test.

## Done criteria

- [ ] All commands green (tsc/lint/test:run)
- [ ] New films inserted via TMDB match carry confidence/strategy/matchedAt
      (verify with one live scrape of a single venue: `/scrape-one <slug>`,
      then select the newest film row)
- [ ] The 6 test groups above exist and pass
- [ ] No existing match flips without analysis
- [ ] Changelogs updated; `plans/README.md` row updated

## STOP conditions

- Any "Current state" excerpt no longer matches live code.
- An existing test's expected match changes (analyse; don't silently update).
- The director credit fetch would add >2 API calls per *typical* (non-tied)
  match — the gate must keep it tie-only.
- You find `findBestMatch` is called anywhere besides `matchFilmToTMDB`.
