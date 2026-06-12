# Plan 007: Letterboxd integrity — stop guessing, persist the canonical slug, widen classic-year tolerance

> **Executor instructions**: Follow step by step; verify each gate. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 716e543..HEAD -- src/db/enrich-letterboxd.ts src/lib/letterboxd-import.ts src/lib/jobs/letterboxd-import.ts src/agents/fallback-enrichment/letterboxd.ts src/db/schema/films.ts`
> On drift, compare excerpts before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (one schema migration; enrichment behavior change is
  strictly *more conservative*)
- **Depends on**: none. Complements 005 (wrong TMDB → wrong Letterboxd
  cascade shrinks as 005 lands) but does not require it.
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

Live production has Letterboxd links pointing at the wrong films:
"Doctors Under Attack – Dr Ghassan Abu-Sittah Speaks" → `/film/gaza/`,
"Projections in Time" → `/film/doctor-who/`, "Nighthawks (1978)" → the 1981
Stallone film, "Star Wars: The Mandalorian and Grogu" → the 1977 film.
Three root causes (verified 2026-06-11):

1. The enricher **guesses a slug from the title even when the film has no
   TMDB match** — for event-titled rows the guess is garbage.
2. The plain-slug fallback (`/film/{slug}/` after `/film/{slug}-{year}/`
   404s) resolves to the most famous same-titled film.
3. Letterboxd's own canonical slug (`data-film-slug`, extracted during
   watchlist import in `src/lib/letterboxd-import.ts` — interface field
   `letterboxdSlug`, populated ~line 231) is **discarded**: zero references
   in `src/lib/jobs/letterboxd-import.ts`.

Also: watchlist matching uses year tolerance ±1, so restorations/reissues
(Letterboxd lists restoration year) miss the local film and spawn duplicate
rows via the background TMDB import.

## Current state (verified)

- `src/db/schema/films.ts` — has `letterboxdUrl`, `letterboxdRating`;
  NO slug column, NO enrichment timestamp.
- `src/db/enrich-letterboxd.ts` — `titleToSlug()` (lines ~13–30);
  `fetchLetterboxdRating(title, year)` tries `/film/{slug}-{year}/` then
  `/film/{slug}/`; verifies page year ±1 from `og:title` (good — keep);
  rate-limits 500ms.
- `src/agents/fallback-enrichment/letterboxd.ts` — duplicate of the
  slug-guess logic for the fallback agent.
- `src/lib/jobs/letterboxd-import.ts` — background import for unmatched
  watchlist entries; calls `matchFilmToTMDB(entry.title, { year:
  entry.year ?? undefined, skipAmbiguityCheck: true })`; creates films
  atomically on `tmdbId` conflict (PR #659).
- `src/lib/letterboxd-import.ts` — local match: `normalizeTitle` + year
  exact, then ±1, then single-candidate fallback.

## Scope

**In scope**: the five files above + one Drizzle migration + tests +
changelogs.
**Out of scope**: TMDB matching internals (005); a Letterboxd search-API
integration (deferred — undocumented API, high breakage risk); any
re-enrichment scheduler beyond the staleness query (note it, don't build it).

## Git workflow

Branch `fix/letterboxd-integrity`; conventional commits; both changelogs;
code-reviewer agent before PR. Migration via the repo's normal Drizzle flow
(`db:generate` → review SQL → `db:migrate` — the journal is healthy as of
2026-05-04).

## Steps

### Step 1: Schema — add `letterboxd_slug` and `letterboxd_enriched_at`

In `src/db/schema/films.ts` next to the existing letterboxd columns:

```ts
  letterboxdSlug: text("letterboxd_slug"),
  letterboxdEnrichedAt: timestamp("letterboxd_enriched_at"),
```

Generate the migration, **read the generated SQL** (must be two ADD COLUMNs
on films, nothing else), apply to dev/prod per repo flow.

**Verify**: `npx tsc --noEmit`; `SELECT letterboxd_slug FROM films LIMIT 1` works.

### Step 2: Stop slug-guessing without an anchor

In `src/db/enrich-letterboxd.ts`, in the per-film enrichment loop, skip
films with no TMDB id:

```ts
if (!film.tmdbId) {
  skipped.push({ id: film.id, reason: "no_tmdb_anchor" });
  continue;
}
```

Apply the same guard in `src/agents/fallback-enrichment/letterboxd.ts`.
Films without a TMDB match get NO letterboxd URL — a missing link is
correct; a wrong link is a bug.

Test: a film row with `tmdbId: null` is skipped and its `letterboxdUrl`
remains null even when a same-titled famous film exists.

**Commit**: `fix(letterboxd): never assign slugs to films without a TMDB anchor`.

### Step 3: Persist the canonical slug everywhere we learn it

3a. **On successful enrichment fetch** (`enrich-letterboxd.ts`): the final
URL after Letterboxd's redirect (or the slug embedded in the fetched page's
`og:url`) is canonical. Extract and store:

```ts
const slugMatch = finalUrl.match(/letterboxd\.com\/film\/([^/]+)\//);
await db.update(films).set({
  letterboxdRating: rating,
  letterboxdUrl: finalUrl,
  letterboxdSlug: slugMatch?.[1] ?? null,
  letterboxdEnrichedAt: new Date(),
}).where(eq(films.id, film.id));
```

(If the current fetch uses `fetch(url)` without exposing the final URL,
use `response.url` — undici sets it to the post-redirect URL.)

3b. **On watchlist import**: thread `entry.letterboxdSlug` from
`src/lib/letterboxd-import.ts` into the background job
(`src/lib/jobs/letterboxd-import.ts`). When the job creates a film from a
TMDB match for that entry, set `letterboxdSlug: entry.letterboxdSlug`,
`letterboxdUrl: \`https://letterboxd.com/film/${entry.letterboxdSlug}/\``.
This is the **highest-trust source** (Letterboxd's own id) — it overwrites
any guessed value.

3c. **Prefer the stored slug** in enrichment: if `film.letterboxdSlug` is
set, fetch `/film/{slug}/` directly and skip guessing entirely.

Tests: import path persists the slug; enrichment prefers it; rating fetch
updates `letterboxdEnrichedAt`.

**Commit**: `feat(letterboxd): persist canonical slug from imports and enrichment`.

### Step 4: Era-scaled year tolerance in watchlist matching

In `src/lib/letterboxd-import.ts` local matching (the `±1` block):

```ts
function yearTolerance(year: number): number {
  if (year < 1970) return 3;
  if (year < 2000) return 2;
  return 1;
}
```

…and use `Math.abs(f.year - entry.year) <= yearTolerance(entry.year)`.
Keep the existing exact-match-first ordering. Also: when multiple
candidates share a normalized title and the entry has NO year, mark
unmatched instead of taking the first candidate (the "Mary 1931" accident).

Tests: Vertigo entry year 2012-restoration vs local 1958 → still matched at
tolerance 3? No — |2012−1958| = 54; tolerance does NOT cover restoration-vs-
original gaps that large, and widening further would create false merges.
The test cases to write: 1968 vs 1970 (matched, classic ±3), 1999 vs 2001
(unmatched, ±1 era), ambiguous-title-no-year → unmatched. Note in code why
restoration-year gaps >3 are left to the slug path (3b), which matches by
Letterboxd id and is immune to year drift.

**Commit**: `fix(letterboxd): era-scaled year tolerance + reject ambiguous no-year entries`.

### Step 5: Backfill + staleness report (scripts, no scheduler)

Create `src/scripts/backfill-letterboxd-slugs.ts` (default-dry per repo
convention, `--execute` to apply):

1. Parse slug out of every existing slug-style `letterboxd_url`
   (`/film/{slug}/` pattern) → fill `letterboxd_slug` (no network).
2. For `/tmdb/{id}`-style URLs (106 films), fetch each (500ms rate limit),
   follow the redirect, store final slug+URL. Verify page year against
   `films.year` ±1 — on mismatch, print for review instead of writing.
3. Print films with `letterboxd_enriched_at IS NULL AND letterboxd_url IS NOT NULL`
   count as the staleness baseline.

**Verify**: dry run prints sane plan; execute; re-run dry → empty.
Spot-check "Nighthawks (1978)": after backfill + (plan 004's data fixes)
its URL must NOT resolve to the 1981 film.

**Commit**: `feat(letterboxd): slug backfill script`.

### Step 6: Changelogs, review, PR

Both changelog locations; code-reviewer agent on the diff; PR.

## Done criteria

- [ ] tsc/lint/test:run green; migration applied cleanly
- [ ] No code path can write a letterboxd URL to a film with `tmdb_id IS NULL`
      (grep the three write sites and confirm the guard)
- [ ] Canonical slug persisted from both import and enrichment paths
- [ ] Backfill executed: `SELECT count(*) FROM films WHERE letterboxd_url IS NOT NULL AND letterboxd_slug IS NULL` ≈ 0
- [ ] Changelogs + `plans/README.md` updated

## STOP conditions

- The generated migration contains anything beyond the two ADD COLUMNs.
- `response.url` doesn't carry the post-redirect URL in this codebase's
  fetch setup (then extract the slug from the page's `og:url` meta instead —
  if neither works, report).
- Letterboxd starts returning 403/captcha during the backfill (bot
  detection) — stop the backfill, report, do not add evasion.
- Backfill year-verification flags >10% of `/tmdb/` redirects as mismatched
  (signals a deeper TMDB-match problem; coordinate with plan 005/008).
