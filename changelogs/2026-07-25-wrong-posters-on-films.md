# Wrong posters on films — hydration shift + unverified TMDB poster writes

**PR**: TBD
**Date**: 2026-07-25

Reported as "posters are being displayed on the wrong films sometimes". Investigation
found **two independent causes**, both live in production.

---

## Cause 1 — every card wearing the previous film's poster (render layer)

The dominant cause, and the one that explains "sometimes".

### Chain

1. `/` and `/this-weekend` are ISR-cached for an hour and served with
   `stale-while-revalidate=86400`, so a visitor can be handed HTML up to a day
   older than their own clock. `/tonight` is the same with a 15-minute window.
2. Each page re-filters expired screenings at render time
   (`+page.svelte` → `Date.now()` → `calendar-filter.ts` `if (dtMs <= now) continue`).
   That filter also ran during the **first client render**, so the client's list
   was shorter than the server's — the films whose screenings had expired since
   the HTML was generated were dropped.
3. The keyed `{#each ... (film.id)}` therefore reconciled against server DOM that
   was offset by one or more positions.
4. Svelte deliberately **skips writing `src` and `srcset` while hydrating**
   (`svelte/src/internal/client/dom/elements/attributes.js`: *"we assume they are
   the same between client and server"*). Text bindings got patched, image
   sources did not.
5. Nothing re-renders afterwards — `Date.now()` is not reactive — so the wrong
   poster stayed for the whole session.

### Evidence

Measured on production (pictures.london), desktop 1440px:

- Server HTML (JS disabled): **43** cards, every poster correctly paired.
- After hydration: **40** cards, **31 of them** rendering a *different* film's
  poster — `complete=true`, `naturalWidth=264`, i.e. fully painted, not a
  decoding lag. Identical at 2.5s and 8.5s, so permanent.
- The mismatch is a clean off-by-one chain: `THE MARRIAGE OF MARIA BRAUN` showed
  *THE INVITE*'s poster, `THE SEARCHERS` showed *MARIA BRAUN*'s, `BLUE HERON`
  showed *THE SEARCHERS*'.

The same failure mode was already known in this repo but only patched at one
source: `stores/filters.svelte.ts` defers its localStorage restore behind two
rAFs with the comment *"trips a keyed-{#each} bug where `<img src>` attributes
don't pick up the new reactive value when the each-block keys change"*. The
clock divergence was never recognised as the same class of problem.

### Fix

New `frontend/src/lib/hydration-clock.svelte.ts`. `hydrationSafeClock(serverNow)`
reports the instant the payload was built until an `$effect` confirms hydration
has committed, then switches to live time:

- the first client render is identical to the server's, so nothing shifts;
- the update that follows runs through the normal, non-hydrating path, where
  `src` *is* written — so expired screenings still disappear as before.

`renderedAt: Date.now()` was added to the three page loads so the server's
instant survives ISR caching. On `/` the same gate covers `todayStore`, whose
London date would otherwise diverge across midnight and drop a whole day group.
(That also kills a latent staleness bug: `todayStore` initialises at module eval
and only ticks in the browser, so a warm serverless container alive across
midnight was rendering the grid against yesterday's date.)

`FigmaFilmCard` and `FigmaTextDay` re-filtered their own screening lines against
a live `Date.now()`, which is the same hazard one level down. Both now take the
clock as a required prop — deliberately not defaulted, so a future caller has to
think about it. This did not strand posters on its own (Svelte only skips `src`,
`srcset` and `href`-on-`<link>` while hydrating, so the card's inner subtree
healed itself), but it caused a needless hydration mismatch and subtree rebuild,
and it would become poster-stranding the moment a screening line grew an image.

### Verification

`frontend/tests/poster-hydration.spec.ts` reproduces it deterministically: the
server renders with the real clock, the page's clock is advanced past the end of
the first rendered day (realistic, given the 24h stale-while-revalidate window).

- Without the fix: **fails** — `OBSESSION` rendered
  `sm5TGX8WbnCd9Uo26cLyTxVwA1n.jpg`, which belongs to
  *NIRVANNA THE BAND THE SHOW THE MOVIE*.
- With the fix: **passes**, and the test's precondition assertion
  (`after.length < baseline.length`) confirms the live filter still removes
  expired screenings.

---

## Cause 2 — posters fetched by unverified TMDB title search (data layer)

### Chain

`PosterService.tryTMDBSearch` took `results[0]` from a bare TMDB
`/search/movie`. TMDB orders those by popularity, not by whether the hit is the
film in question. This path runs **only when the film has no `tmdbId`** — i.e.
only when the tuned identity matcher (`matchFilmToTMDB`: ambiguity gate, title
similarity floor, competitor penalty, TMDB blocklist) had already *declined* the
title. The unguarded search was overruling the very safeguards that had just
rejected it, and the resolved id was never persisted, so no repair sweep revisits
the row (`daily-sweep` Phase 4 only selects `posterUrl IS NULL`; Phase 2 requires
`tmdbId IS NOT NULL`).

Reached in production from `scrapers/pipeline.ts` (both the create and update
paths), `lib/jobs/daily-sweep.ts`, `db/enrich-posters.ts` and
`scripts/poster-audit-and-fix.ts`. OMDB and Fanart keys are unset, so this was
the only non-scraper poster source for these films.

### Evidence

`films.tmdb_id IS NULL AND poster_url LIKE '%image.tmdb.org%'` = **213 rows**,
**101 of them with upcoming screenings** (474 screenings). A TMDB-hosted image on
a row with no TMDB identity is only producible by this function. Spot checks were
byte-identical to `results[0]`:

| Listing | Poster actually belongs to |
|---|---|
| `4K Restoration` (Tarkovsky's *Nostalgia*, 18 screenings) | *GUMBY (4K RESTORATION)* |
| `GIANT – The Play` (30 screenings) | *Giant* (2026 film) |
| `The Birds` | *The Angry Birds Movie* |
| `The Silence` | *The Silence of the Lambs* |
| `The Killers` | *Killers of the Flower Moon* |
| `Seven` | *7 Dogs* |
| `In The Dark` | *Dancer in the Dark* |
| `Tilting Iron` | *De Gaulle: Résistance* |
| `White Snow` | *Snow White* (2025) |
| `Love 3D` (Gaspar Noé) | *Baby Princess 3D Paradise Love* |

### Fix

`tryTMDBSearch` now resolves through `matchFilmToTMDB` and returns `null` when
there is no confident match, falling through to the cinema's own artwork and then
the title-card placeholder. The classifier-cleaned retry goes through the same
gate. A poster we cannot attribute is worse than no poster.

`findPoster` already accepted a `director` but never used it; it is now threaded
into the matcher, because `hasSufficientMetadata` requires a year *and* a
director for highly ambiguous titles — without it those titles could never
verify at all.

Covered by `src/lib/posters/service.test.ts`, including an explicit assertion
that no raw `searchFilms` call is made when the matcher declines.

One knock-on had to be fixed with it: `db/enrich-posters.ts` wrote
`result.url` unconditionally, placeholders included, while selecting on
`posterUrl IS NULL OR posterUrl = ''`. More films now fall through to the
placeholder, so that script would have persisted generated SVGs and excluded
those rows from its own query forever. It now guards on
`source !== "placeholder"` like every other caller already did.

### Known remaining gap

The pipeline calls `matchFilmToTMDB` with `{ year, director, runtime,
venueLanguages }` and, when that declines, the poster path re-asks with only
`{ year, director }`. Dropping the runtime hint disables
`applyRuntimeCrossCheck`, so a feature-length screening whose top TMDB hit is a
same-titled short can still get that short's poster. Rarer than the original
bug and strictly better than the unguarded search, but not closed. Threading
runtime through `PosterSearchParams` is the follow-up.

### Not done — existing rows

The 101 affected rows are **not** cleaned up by this change; only new writes are
prevented. Running the scored matcher over them would drop ~80 posters, and a
manual review of that set shows roughly half are in fact correct (`Don't Look
Now`, `Laura`, `Audition`, `Blacula`, `Cube`, `La notte`, `Häxan`,
`Abbott and Costello Meet Frankenstein`). Deciding how to treat those is a
product call, left open deliberately.

---

## Cause 3 (minor) — Letterboxd's default share card stored as a poster

`agents/fallback-enrichment/letterboxd.ts` rejected `empty-poster` and
`placeholder` og:image URLs, but Letterboxd's generic social card
(`s.ltrbxd.com/static/img/default-share-*.png`) matches neither while passing the
`ltrbxd.com` host check. Five films with upcoming screenings were wearing the
Letterboxd logo. The rejection list now covers `default-share` and
`/static/img/`.

---

## Impact

- **Users**: on a stale cache, most of the homepage grid showed the wrong poster.
  Fixed. Films whose identity cannot be verified will now show the cinema's own
  artwork or a title card instead of a stranger's poster.
- **Routes touched**: `/`, `/this-weekend`, `/tonight`.
- **Scrape pipeline**: fewer posters written, all of them attributable.
