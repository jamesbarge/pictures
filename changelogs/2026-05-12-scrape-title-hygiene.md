# /scrape title hygiene — prevent the duplicates the /data-check patrol keeps merging

**PR**: TBD
**Date**: 2026-05-12

## Summary

Three coordinated changes to stop the /scrape pipeline producing duplicate film rows. The /data-check patrol has been merging 6-14 of these per 40-film batch for the last two cycles; this PR plugs the source.

## Motivation

The data-check patrol reports for cycles 16-17 (2026-05-11 → 2026-05-12) showed a stable steady-state where every batch caught a similar volume of prefix-family duplicates, year contamination, and `is_repertory` errors. Sample fixes from a single run (`patrol-2026-05-12-0703.md`):

- 6× TMDB merges of cinema-prefixed duplicates (`Classic Matinee: HARD TRUTHS` → canonical *Hard Truths*, `Cine-real presents: Badlands` → canonical *Badlands*, etc.)
- 5× event reclassifications (CLUB ROOM strand)
- 2× repertory tag corrections for old films stored with `is_repertory=false`
- 1× TMDB backfill

The patrol is effectively a leaky bucket: it cleans up after the scrape, but the scrape keeps creating the same classes of bad row at the same rate. This PR plugs the bucket.

## Diagnosis

Three distinct mechanisms produce the duplicate rows:

### Mechanism 1 — AI-extractor escape hatch

`src/scrapers/pipeline.ts` runs the AI title extractor first, with `cleanFilmTitle()` as a regex fallback. The fallback only fires when AI confidence is "low" or "medium" AND no `canonicalTitle` is returned (`pipeline.ts:409-412`, pre-fix).

When the AI returns "high" confidence with a still-prefixed title (e.g. `Classic Matinee: JAWS` → unchanged; `Akira (2026 Re-release)` → unchanged), the regex never runs. The bad title hits the DB. The patrol catches it next cycle and merges it.

### Mechanism 2 — Missing prefix/suffix patterns

Even when the regex DOES run, the EVENT_PREFIXES set has gaps. Patterns caught by patrol cycles 15-17 but missing from the cleaner:

| Pattern | Type | Patrol catches |
|---|---|---:|
| `Cine-real presents:` | prefix | 5+ |
| `CLUB ROOM:` | prefix | 3+ |
| `CAMP CLASSICS presents:` | prefix | 1+ |
| `BETTER THAN NOTHING PRESENTS:` | prefix | 1+ |
| `<X> Films presents:` (generic, "presents" with s) | prefix | 3+ (Alborada, Lost Films) |
| `UK/LONDON/WORLD PREMIERE Title` (no separator) | prefix | 5+ |
| `- Birthday Season` / `- Birthday Seaon` | suffix | 10+ |
| `(25th Anniversary 35mm)` etc. | suffix | 4+ |
| `Bugsy Malone-50th anniversary` (no space) | suffix | 1+ |
| `(4K Restoration Premiere)` | suffix | 1+ |
| `: 4K Restoration Premiere` (colon form) | suffix | 1+ |

### Mechanism 3 — Year contamination

`createFilmWithoutTMDB` writes `scraperYear` directly to `films.year` and uses it to derive `isRepertory`. Some scrapers send the screening year (the year the screening takes place) when they can't extract a true release year. Result:

- `films.year = 2026` for ~12 films per patrol batch (audit-flagged as `wrong_year`)
- `is_repertory = false` for old films mis-tagged with the current year (e.g. *Brief Encounter* 1945, *Burning Ambition* 1989)

## Changes

### `src/scrapers/pipeline.ts`

Always apply `cleanFilmTitle()` on top of AI extraction. Same change for `canonicalTitle`.

```ts
- let cleanedTitle = extraction.filmTitle;
- if ((extraction.confidence === "low" || extraction.confidence === "medium") && !extraction.canonicalTitle) {
-   cleanedTitle = cleanFilmTitle(title);
- }
+ let cleanedTitle = cleanFilmTitle(extraction.filmTitle ?? title);
+ if ((extraction.confidence === "low" || extraction.confidence === "medium") && !extraction.canonicalTitle) {
+   cleanedTitle = cleanFilmTitle(title);
+ }
```

And:

```ts
- const matchingTitle = extraction.canonicalTitle || cleanedTitle;
+ const matchingTitle = extraction.canonicalTitle
+   ? cleanFilmTitle(extraction.canonicalTitle)
+   : cleanedTitle;
```

The regex cleaner is idempotent — re-running it on already-clean strings is a no-op.

### `src/scrapers/utils/film-title-cleaner.ts`

8 new patterns added, structured into the existing groups:

- Castle Cinema family added inline at the end of `EVENT_PREFIXES`
- Generic `<Org> Films presents:` added as a separate generic catcher
- Premiere separators relaxed from `[:|I]` to `[:|I]?\s+`
- Birthday Season suffix added to the suffix-strip block
- Anniversary regex broadened to include `35mm/70mm/imax/4k` qualifiers
- Dash-prefixed anniversary regex now allows zero spaces before the dash
- `: 4K Restoration Premiere` colon-suffix stripped BEFORE the colon handler (otherwise the handler treats `Vampire's Kiss : 4K Restoration Premiere` as `prefix:title` and picks the wrong side)

### `src/scrapers/utils/film-matching.ts`

Year sanitization in `createFilmWithoutTMDB`:

```ts
const currentYear = new Date().getFullYear();
const cleanYear =
  scraperYear && scraperYear >= 1900 && scraperYear < currentYear
    ? scraperYear
    : undefined;
```

`cleanYear` is then used for `films.year`, the poster-lookup year hint, and the `isRepertory` derivation. Future/current-year placeholders become `null` and TMDB enrichment fills them.

### `src/scrapers/utils/film-title-cleaner.test.ts`

28 new unit tests across 5 new describe blocks:

- Castle Cinema prefix family (cycles 15-17)
- Premiere prefix without separator
- Birthday Season suffix (typo-tolerant)
- Anniversary + format combo suffixes
- Premiere-format combo suffixes

## Impact

- **Estimated 80% reduction in prefix-family duplicates** created per scrape (the AI-extractor escape hatch was the dominant source; the 8 new patterns cover the rest of the patrol-observed long tail)
- **~12 fewer year-contaminated `films` rows per patrol batch** (year-2026-as-placeholder won't be written; TMDB enrichment fills the real year)
- **`is_repertory` correctness improved** for the same population — old films won't be tagged `false` because their year was the current year
- Patrol fixes-per-batch should drop substantially over the next 1-2 cycles as the existing backlog clears and the input rate drops

## Verification

- `npm run test:run src/scrapers/utils/film-title-cleaner` — 64/64 pass (28 new)
- `npm run test:run src/scrapers` — 322/322 pass
- `npm run test:run` (full suite) — 906/906 pass
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (pre-existing warnings only)

## Risk

- **Generic `<X> Films presents:`** tightened after code review: requires plural `Films` AND `presents` (with s). The singular `present`/`Film` variants are too generic ("My Film Present X"). Bare `<X> Films:` (no "presents") is left to the colon handler — that's the correct path for venues like Coldharbour where the colon form is venue branding, not a distributor strand.
- **Premiere-without-separator** char class is `[:|]?` only — the original `[:|I]?` was a bug. With the `/i` flag, `I` matched the leading capital letter of I-titled films (e.g. "UK Premiere Iron Man" → "ron Man"). Regression guard added.
- **Year sanitization** is conservative: any year >= currentYear is discarded. This loses some true 2026 release dates that scrapers could provide accurately. Trade-off accepted because TMDB enrichment fills them within a day and the false-positive rate of the screening-year-as-placeholder pattern is much higher. If post-shipping we see legitimate 2026 releases stuck at `year: null`, the fix is to add a scraper-side `isNewRelease: true` signal that bypasses the sanitization rather than relax the year check.
- **Dash-anniversary tail** uses `.*$` — eats everything after `Nth Anniversary`. This is intentional (most real cases are "(50th Anniversary) + Q&A" where we want the whole tail gone) but could over-strip a legitimate subtitle. No counter-examples found in current data.

## Follow-ups

- Picturehouse circuit-wide booking URLs (one URL serving 10 distinct films) is a separate, unrelated issue surfaced by the patrol. Worth a dedicated PR.
- A handful of CAMP CLASSICS variants survived this run's pattern because the existing TMDB binding was already correct (the patrol only needed `wrong_new_tag` fix, not a merge). These won't recur once the new prefix strip catches them at insert time.
