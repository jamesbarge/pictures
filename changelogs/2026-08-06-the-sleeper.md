# THE SLEEPER — one acclaimed-but-under-seen repertory film per day

**PR**: TBD
**Date**: 2026-08-06

## What this adds

A single film per London calendar day that is rated highly on Letterboxd but
thinly voted on TMDB — acclaimed, but comparatively few people have seen it —
drawn only from repertory, non-documentary programming, and guaranteed to have
a screening that day. It is surfaced as a vertical `THE SLEEPER` rail on the
existing homepage card. No reordering, no new layout.

The homepage already sorted each day by Letterboxd rating descending
(`frontend/src/lib/utils.ts:99-119`), so the most celebrated title was always
leftmost and the genuinely interesting obscurity was buried mid-row. There was
no editorial voice anywhere in the product — a repo-wide grep for
`featured|curated|spotlight|editorial|pick` returned nothing.

## The rule

```
score = letterboxdRating − 0.30 · log10(max(voteCount, 1))
```

Gates: `is_repertory`, `content_type = 'film'`, not a documentary,
`letterboxd_rating >= 3.8`, `tmdb_vote_count` between 200 and 2500.
Tie-break: score → lower vote count → filmId (total, so two renders of one ISR
payload cannot disagree).

`K = 0.30` was not chosen by feel. It is bracketed by two real pairs from the
live candidate pool: Punishment Park (4.16, 205 votes) must beat Do the Right
Thing (4.40, 2028) → K > 0.241; Andrei Rublev (4.44, 959) must beat Tampopo
(4.32, 442) → K < 0.357. Both are pinned by tests, so a drift out of that
interval fails CI.

Log rather than linear because `vote_count` is log-normal across this pool
(quartiles ~217 / 611 / 2544) — equal *ratios* should cost equally.

### The credibility floor is load-bearing, not hygiene

Row `1c320081-dfe7-430e-99fd-ced35b2512ae` ("Harakiri") carries the highest
`letterboxd_rating` in the entire candidate pool at **4.68** with
`tmdb_vote_count = 0`. Its `letterboxd_slug` resolves to Kobayashi's 1962 film;
its `tmdb_id` (619820) points at an unrelated 2019 one. A cross-wired identity
row. Under an unguarded score it evaluates to `+Infinity` and wins every day,
forever.

So the 200-vote floor guards two separate failures: 4.7 stars from 12 votes is
noise, **and** in this database a near-zero vote count is the best available
signal that the TMDB match is simply wrong.

`log(0)` is also a hard `ERROR` in Postgres (not a misranking), and the planner
may evaluate a projection on rows `WHERE` has not rejected — hence scoring in
TypeScript and using SQL only for gating and the join.

### Thresholds were measured, not assumed

Excluding documentaries was a deliberate product decision, and the risk was that
it would starve an already-thin pool: Sans Soleil (268 votes), Summer of Soul
(225) and Stop Making Sense (377) are exactly what it removes. Measured across
28 real days before building on top:

| | result |
|---|---|
| days with zero candidates | **0** |
| minimum candidates on a day | **2** (2026-08-27) |
| days losing any candidate to the filter | 8 of 28 (1–3 each) |

The ceiling stays at 2500. At 3000 a simulated thin day picked *Stalker* (2544
votes) — the most canonical arthouse title in the pool, and a self-evident
failure as a "sleeper".

## Storage and cadence

The pick is daily; the pipeline runs weekly; there is no cron. Resolved with a
precomputed `daily_picks` table plus a validating read path.

**Why a table rather than an on-the-fly query:** the 21-day no-repeat cooldown
is inherently stateful. Each day's choice depends on which films the previous
days consumed, so it cannot be expressed as a date-seeded pure function. Remove
the table and you remove the cooldown, and one long-running film wins every day.

- Horizon: today .. +21, recomputed by a new always-run `sleeper` phase.
- **Immutable inside 7 days** — a pick a user can still act on never moves;
  only far-future rows are rewritten as new screenings land.
- Cooldown ladder 21 → 10 → 0 so a starved day degrades instead of failing;
  `cooldown_days_applied` records which tier fired.
- Cooldown is keyed on `letterboxdSlug ?? tmdbId ?? id`, **not** `film_id`:
  there are 115 duplicate-`letterboxd_slug` groups covering 255 rows in this
  database, so a film-id key is evadeable and one film could win twice in a week
  under two rows.
- `ON DELETE CASCADE` is required, not cosmetic: `db:cleanup-films` deletes
  films that lose all their screenings, and without it that script would start
  throwing FK violations.
- `algo_version` lets the refresh replace rows computed under older settings
  instead of guessing whether stored scores are still comparable.

**The stored row is an advisory cache, not the truth.** Screenings get cancelled
between weekly scrapes, so the read path validates that the picked film still
screens that day and recomputes any date it drops. Checking only that a row
*exists* would surface picks you cannot actually go and see. The fallback calls
the same selection function the pipeline uses — one implementation, no drift —
and never persists (a public GET must not write; concurrent cold serverless
invocations would race).

The phase is registered in the `PhaseId` union and the run body only —
deliberately **not** in `CHECKPOINTABLE` or `phaseSequence`. Those exist for
expensive work you don't want to redo; this costs ~2s and is idempotent, and the
picks depend on `screenings`, which change even under `--skip-enrich`. Making it
skippable would let a `--resume` leave picks stale relative to the data the
resumed run just fixed.

## API

`GET /api/sleepers?days=14` returns a **date → pick map**, not a single "today".

That shape is what makes ISR staleness a non-issue by construction rather than
by mitigation: the homepage is ISR-cached for an hour and served stale for up to
a day, so a response describing only "today" would be wrong for everyone after
the London midnight rollover. Returning the window means hour-old HTML still
holds the correct entry for whatever day the client resolves as first-visible,
and nothing on the render path consults a clock.

That last point matters specifically here: this app has already shipped a
hydration bug where a server/client first-render divergence stranded every card
on the previous film's poster (PR #736).

## UI

A bottom-anchored inverted rail cell in `FigmaFilmCard.svelte`, rendered only on
the first visible day section.

The rail is 396px tall while its existing year/director/format cells sum to at
most ~130px, leaving ~265px dead. `THE SLEEPER` set vertically at 12px is ~120px,
so `margin-top: auto` consumes slack **only** — card width and height are
unchanged, and `fitToFirstRow` (which measures `:scope > .card` to align the
black day bar with the card row) is undisturbed. That is what makes marker-only
genuinely zero-risk, and it is asserted in the tests.

### Colours are hardcoded hex, and that is deliberate

The obvious thing to copy was `.more-rail`, which uses
`background: var(--color-text); color: var(--color-cream)`. **That component is
quietly broken:** under `[data-theme="dark"]` both tokens resolve to `#eae5c2`
— cream on cream — and the DimmerDial lerps `--color-text` toward cream while
leaving `--color-cream` fixed, ending at roughly 1.05:1 contrast.
`--color-screening-bg`/`-text` fail the same way; they invert *together* and so
cross at the dimmer's midpoint.

`.day-header` already hardcodes `#1f1f1f`/`#eae5c2` with a comment explaining
exactly this. `.rail-sleeper` follows it, plus a `[data-theme="dark"]` override
(the dark page surface is `#1a1a1a`, against which a `#1f1f1f` block reads as a
hole rather than a mark). A Playwright test asserts the computed colours with
the dimmer at full, so the cream-on-cream regression cannot return.

`.more-rail` itself is left alone — out of scope, but the comment on
`.rail-sleeper` explains why the two differ.

### Accessibility

The explanation sits on the `<article>`, not inside `.rail`: `.poster-row` is an
`<a>` whose accessible name is computed from its subtree, so an `sr-only` string
in the rail would corrupt the *link* name into "1975 KUBRICK THE SLEEPER HIGHLY
RATED RARELY SEEN". Plus a native `title` for pointer users and one FAQ-schema
entry defining the term.

The wording carries **no numeral**. Ratings are deliberately spoiler-gated
behind `LetterboxdRatingReveal.svelte`, and a marker that printed "4.3★" would
quietly undo that decision. A test asserts no digit appears in either the
visible text or the accessible name.

Text mode gets a `SLEEPER` chip *before* the title, inside the existing title
cell — that cell is `nowrap`/`ellipsis`, so a trailing chip would be silently
clipped on long titles, and a seventh grid column would mean editing all three
`grid-template-columns` declarations. The flag shows only on the film's earliest
remaining screening, or a film with five showings would stamp five chips.

## Found in code review, fixed before merge

**A real cooldown bug that would have fired on every weekly run.**
`getLastPickedMap(today)` seeded cooldown state from `pick_date < today` only,
but `upsertPick` refuses to overwrite today..+7. So the writable days (8–21)
were chosen with no knowledge of what was actually *stored* for days 0–7 — the
cooldown was enforced against films the run merely imagined for those dates.

Concretely: run A writes Punishment Park to Aug 15; run B on Aug 13 freezes that
row but cannot see it, so Punishment Park is unconstrained, wins Aug 22, and
that row *is* writable. Same sleeper 7 days apart, against the 21-day no-repeat
that is the sole justification for `daily_picks` existing as a table.

Fixed with an `alreadyPicked` argument to `selectPicksForHorizon`: dates whose
pick is already decided register their film in the cooldown and are skipped
rather than re-emitted. The read-time fallback had the same bug in a different
shape — it could duplicate a stored pick on an adjacent day — and now receives
the stored set for the same reason.

Three tests cover this and were each **confirmed to fail against the pre-fix
code**. The first attempt at one of them could not fail (it asserted an outcome
both versions produced); it now freezes the *weaker* film so honouring the
frozen row inverts the result.

Also from review:
- **The dimmer test was vacuous.** It never engaged the dial, so it ran at
  dimmer 0 — where `var(--color-text)`/`var(--color-cream)` happen to equal the
  hardcoded pair, meaning it would have passed against the exact CSS it claims
  to reject. It now seeds `pictures-dimmer` and asserts the dimmer engaged
  before asserting anything else.
- **Possible accessible-name leak.** The marker cell carried a `title` and was
  not itself `aria-hidden`; name-from-content can fall back to `title` on an
  element whose only child is hidden, which would have appended the sentence to
  the *link's* name — the exact leak the article-level `aria-label` exists to
  prevent. The cell is now `aria-hidden`.
- Degraded cooldown tiers now prefer the least-recently-picked candidate over
  the highest-scoring one. Below the top tier we are already starving, and the
  failure users notice is the same film two days running.
- `getStoredPicks` filters on `algo_version`, so an algo bump can no longer
  serve old-rule picks alongside a new `meta.algoVersion`.
- `getCandidatesByDate` gained an upper datetime bound (it matched every future
  screening and is on the public API's fallback path).
- A declined refresh now sends a Telegram alert. Writing nothing at all is
  strictly more severe than one missing day, which already alerted.

## Verification

- **Backend**: `npx tsc --noEmit` clean; 62 unit tests (46 scoring/cooldown, 16
  London-date) plus 13 API route tests.
- **End to end**: ran the real `refreshSleeperPicks()` against production data —
  **22 picks across 22 days, 22 distinct films**, zero empty days, zero cooldown
  degradation, no documentary leaked through, and no canon (no Stalker, no Seven
  Samurai). One thin day flagged exactly as designed.
- **Frontend**: `svelte-check` 0 errors; full Playwright suite **214 passed, 8
  skipped (pre-existing), 0 failed**, including 14 new Sleeper assertions across
  both projects.
- Screenshots checked at 1440px and 390px.

⚠️ **Playwright cannot mock this feature.** `/api/screenings` and
`/api/sleepers` are fetched by the SvelteKit *server* load, so `page.route()`
never fires. The E2E tests therefore assert invariants (at most one marker, only
in the first day section, no numeral, 328px card width, day-bar alignment,
dimmer legibility); the selection rule itself is pinned by unit tests.

## Impact

- **Users**: one extra marker on the homepage's first day section. Nothing else
  moves. If the API fails, the marker is absent and the page is unchanged — the
  `.catch` is on the individual promise, not around `Promise.all`, because
  `Promise.all` rejects on first rejection and would otherwise take the whole
  homepage to the error page over a decorative marker.
- **Data**: new `films.tmdb_vote_count` column, backfilled for 2,010 films
  (~8.5 min, 2,010 TMDB calls). It now stays fresh via the weekly
  `cleanup-upcoming-films` path, which already refreshes `tmdb_popularity` for
  every upcoming film — no new job needed.
- **Migrations 0014 and 0015 are hand-applied and already live.** `db:migrate`
  will not apply them: `meta/_journal.json` stops at 0006, so `drizzle-kit
  generate` diffs against a stale snapshot and would try to re-add
  `tmdb_popularity`, `letterboxd_slug` and friends.

## Accepted limitations

- A better candidate appearing mid-week will not displace a still-valid stored
  pick. That is stability, and it is the right trade — but it is deliberate.
- The far end of the 22-day horizon is computed against screenings up to a week
  stale.
- 263 films have a Letterboxd rating but no `tmdb_id` and so can never be
  picked (~1 currently in-pool).
- Expect a skew toward slower, older, subtitled repertory. That is the feature
  working.
- `/tonight` and `/this-weekend` reuse the same card and will not show a marker
  (the prop defaults to `false`). Three lines per route if we want it later.
- **At full dimmer the marker's `#1f1f1f` block sits within ~1 unit of the
  dimmed surface, so it stops reading as a distinct block.** The label itself
  stays highly legible (cream on near-black, ~12:1) and the cream border
  survives. This is the same behaviour the shipped `.day-header` already has,
  since it uses the identical hardcoded pair — consistent with the established
  idiom rather than a new defect, but worth knowing. `[data-theme="dark"]` is a
  separate mechanism from the dimmer and *is* handled.
- **Most Sleeper E2E assertions pass vacuously when no marker is on screen** —
  `toBeLessThanOrEqual(1)` is satisfied by 0, and four tests `test.skip`
  outright. On a day where the pick's film has no upcoming screening in the
  first visible section, the suite goes green having checked nothing. Real
  coverage of the *rule* lives in the unit tests; the E2E layer only guards
  layout and leakage invariants. A canary that asserts the marker is genuinely
  rendered would need a fixture-backed API, which is out of scope here.
- `getStoredPicks` validates that the pick's film screens that London *day*, not
  that a screening is still in the future — so after the last showing has passed
  the row stays "valid" while the card shows no upcoming times.
