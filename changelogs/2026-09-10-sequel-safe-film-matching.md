# Sequel-safe film identity

**PR**: #753 (source branch `fix/sequel-safe-film-matching`)
**Date**: 2026-09-10
**Base**: `eae19e933ffcb462787d1eb0a3b02dc9bb5c4865` (`main`, #752)

## The problem

Neither of the two title-matching paths could tell a film from its sequel.

Evidence is the 2026-09-09 full run,
`tmp/scrape-logs/scrape-full-20260909-221554.log`
(sha256 `014df99672d9952e23372d07942b57291522cf7f0b889dfc824f45c5af02fdda`,
802124 bytes, recorded exit code 1):

- **36** logged acceptances of `"Practical Magic 2"` as `"Practical Magic"` at
  89%. The run also logged **9** year-window rejections of the same title, but
  each is immediately followed by an acceptance, so those 9 are already inside
  the 36 rather than additional to it.
- **1** acceptance of `"Rob Zombie's Halloween II"` as
  `"Rob Zombie's Halloween"` at 88%.
- Found by scanning all 84 distinct similarity matches in the run, not in the
  original brief: `"Mockingjay - Part 2"` → `"Mockingjay - Part 1"` (80%),
  `"The Bill Reunion 17"` → `"…16"` (82%),
  `"Satyajit Ray Short Film Competition"` → `"… Part 1"` (85%),
  `"SCREEN IN USE - 45"` → `"Screen in Use - 30"` (70%).

These are **match events, not screening counts**.

### The year window could not see it

`violatesYearWindow` rejects only when *both* sides carry a year. Read-only row
evidence shows two film rows titled `Practical Magic`, both at 89%:

| id | year | tmdb | screenings total / future / cinemas |
|---|---|---|---|
| `5560542a-122a-487a-9927-2f25d4fd5269` | 1998 | 6435 | 676 / 647 / 29 |
| `81fa3c8d-5f78-483c-9dc9-323492c455d2` | NULL | NULL | 217 / 217 / 10 |

So 27 acceptances logged no rejection at all, and the other 9 came on the line
immediately after the 1998 row was refused on year. A second row of the same
title whose NULL year the window cannot judge is a plausible explanation for
those 9; the log prints only the candidate's title, so which row each acceptance
took is **not** established, and the table above is today's snapshot rather than
a record of the run.

`Rob Zombie's Halloween II` is the same shape. The log records a match to the
*title* `"Rob Zombie's Halloween"` and names no row id, so which record took it
is not established. Today's snapshot shows one row with that title (`287dd7ab`,
2007) and a row titled `"Halloween II"` (`be7f286b`, 2009, tmdb 24150) — the
film the source title names — currently holding 0 screenings. Whether it holds
none *because* of these matches is not established here.

## Changes

### A shared, DB-free helper

`src/lib/title-patterns.ts` — an existing pure title-utility module, chosen so
`src/lib/tmdb/match.ts` can share it without pulling Drizzle in:

| Function | Answers |
|---|---|
| `sequelMarkerOf(title)` | which instalment this is, or null |
| `trailingNumberOf(title)` | the number identifying the title, instalment or not |
| `disagreesOnTrailingNumber(a, b)` | whether two titles disagree about it |

The two readings are separate on purpose. `Blade Runner 2049` has **no
instalment marker** — nothing should claim it is the 2049th Blade Runner — but
2049 identifies it, so identity comparison uses `trailingNumberOf` and still
distinguishes it from `Blade Runner`. Comparison is on values, so
`Halloween II` = `Halloween 2`, and `Blade Runner 2049` =
`BLADE RUNNER 2049 (4K Restoration)`.

`src/lib/film-similarity.ts` re-exports all three so its existing importers are
unaffected.

### Guard 1 — the trigram matcher

`findMatchingFilm` rejects a disagreeing candidate **before** the year window,
since the guard needs no year on either side. Rejection `continue`s, so a
correct later candidate is still reached and returned.

### Guard 2 — the TMDB fallback

Guarding only the DB path would have moved the wrong match rather than removed
it: `getOrCreateFilm` hands TMDB the very title the DB guard just refused, and
`calculateSimilarity` awards a containment bonus of
`0.8 + shorter/longer * 0.2`, scoring a base title about 0.976 against its own
sequel.

`findBestMatch` now decides **field eligibility before scoring**. A candidate
offers `title` and `original_title`; each is admitted or refused whole, and a
refused field's similarity is not used in any path:

- **empty, or empty once normalized, is not evidence.** `calculateSimilarity`
  treats an empty normalized string as contained in everything and returns its
  0.8 floor, so a non-Latin original like `魔法` — non-empty raw, empty
  normalized — cleared `minTitleSimilarity` 0.6 and supplied a spurious
  absent-number agreement. The module's own normalizer decides emptiness, not a
  second ad-hoc rule.
- **a field whose number disagrees with the search title is refused.** Judging
  identity on one field and similarity on the other accepted candidates that
  were wrong on every field taken alone: an unrelated `title` lent "carries no
  number, so nothing conflicts" while a conflicting `original_title` lent all
  the similarity.

Similarity is then the max over eligible fields only, and a candidate with no
eligible field is skipped.

Two smaller latent faults fell out of this: an absent `original_title` threw
inside `normalizeTitle` via the old unconditional `Math.max`, and a blank one
contributed a spurious 0.8.

## Supported and unsupported numeric forms

**Supported.** Arabic numerals; Roman I-XXX, canonical round-trip only, so `MIX`
(1009) and `LIV` (54) are not numbers; instalment words `part`, `pt`, `vol`,
`volume`, `chapter`, `episode`, `ep`, `book`, `series`, `season`, `day`, each
optionally followed by a spelled-out `one`-`twenty` (`Dune: Part Two`);
four-digit years as identity numbers but never as instalments. Trailing
bracketed decoration is peeled first, so `Toy Story 5 (BIA)` and
`Sing 2 (Sing-Along)` still read 5 and 2.

**Intentionally unsupported.**

- A number needs a base title in front of it, so `X` (2022), `M` (1931), `1917`
  and a bare `II` carry none. They are titles, not numbered things.
- A trailing explicit date carries none, which leaves the run's
  `Baby Comptines 07/10/2026` family — 9 distinct wrong merges differing only by
  date — to whatever guard handles dated instances. Real merges, but not
  sequels.
- Word numerals with no instalment word are invisible, so a bare `Two` is not
  read.
- Month-differing titles (`… September 2026` vs `… June 2026`) both read 2026 and
  agree, so the guard is silent.
- `Ocean's 11` against `Ocean's Eleven` reads 11 against none and is refused —
  conservative, and a false negative.

**Known imprecision.** A title ending in a single Roman letter reads as a
number, so `Malcolm X` reports 10 and `Who Am I` reports 1. The outcome stays
conservative — such a title only fails against a candidate whose number differs,
and a true variant keeps the same letter — but the number is meaningless.

## Verification

| Check | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **0** | no output |
| `npm run lint` | **0** | 0 errors, 61 pre-existing warnings, none in changed files |
| `npm run test:run -- --maxWorkers=2 --pool=threads` | **0** | 147 files / 2232 tests passed, 250.29s |

`--maxWorkers=2` is the coordinated flag for this machine, and `--pool=threads`
was needed alongside it: an earlier forks run left 10 files unexecuted with
`Failed to start forks worker … Timeout waiting for worker to respond` under a
load average of 282-429 on ~10 cores. Threads finished the same suite in 250.29s
against forks' 1142.59s. No timeout was raised and no test excluded in any
attempt; the attempt census and preserved failure evidence are in the handoff.

### Tested, verified failing-before

Every guard was reverted and re-run to confirm the tests fail without it.

- **The trigram path**, through the real `findMatchingFilm` with only the pg_trgm
  query mocked: all four observed unsafe matches, both `Practical Magic` rows,
  the `Blade Runner 2049` pair in both directions, and the positives
  (`Toy Story 5 (BIA)`, `Selected 16`, `Halloween II`/`Halloween 2`,
  `Godfather, The`, `1917 (70mm)`, `2046 (35mm)`).
- **Correct-next-candidate**, both paths: the wrong candidate is first and, in
  the TMDB case, 180× more popular, and the correctly numbered one behind it is
  still returned.
- **The TMDB path**, through the real `matchFilmToTMDB` with the transport
  mocked and no network: both reviewer-supplied blockers (unrelated main title
  lending agreement; `魔法` normalizing to empty), absent/blank/unrelated-Latin
  `original_title`, and the positives including `original_title` legitimately
  supplying numbering the localised title lacks.
- **The cache path**, through the real `initFilmCache` + `lookupFilmInCache` with
  the real normalizer: instalment markers survive normalization, so an
  exact-match lookup cannot collide a sequel with its base title.

### Inspected, not tested

- **`getOrCreateFilm`'s ordering** (cache → similarity → TMDB). Read, and its
  two reachable branches are tested at their own entry points; the three-step
  sequence itself is not driven end to end here.
- **The 9 duplicate-row acceptances' per-screening attribution.** The log proves
  the 1998 row was first in candidate order for those, and today's snapshot
  shows exactly one other `Practical Magic` row, but which screening rows came
  from this run is not established.
- **The films-table snapshot is today's**, so it cannot prove which row every
  historical event resolved to.

## Impact

- Sequels stop being merged into their base film on both matching paths. Where
  the correct row exists it can now win; where it does not, the pipeline falls
  through to TMDB or creates a new film instead of polluting an existing one.
- **No existing data is repaired.** Rows already pointing at a wrong film stay
  wrong, and the duplicate film rows this run exposed (two `Practical Magic`,
  two `Selected 16`, two `Toy Story 5`) are untouched. Repair belongs to
  `scripts/rematch-unmatched-films.ts`.
- No production write, no rematch, no schema change, no new dependency, no
  runtime network in tests.
