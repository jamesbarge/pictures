# Plan 002: Consolidate the behaviorally-equivalent `normalizeTitle` copies behind one shared helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ed1db0..HEAD -- src/scrapers/pipeline.ts src/scrapers/seasons/season-linker.ts src/scrapers/seasons/pipeline.ts src/db/cleanup-films.ts src/agents/fallback-enrichment/confidence.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but **must land before** plan 003 — season-linker has one of the copies)
- **Category**: tech-debt
- **Planned at**: commit `8ed1db0`, 2026-06-10

## Why this matters

`normalizeTitle` — the primitive that decides whether two scraped titles are
"the same film" — is **copy-pasted in 8 places** with subtly different rules.
Four are behaviorally equivalent dedup-style normalizers that have drifted by
accident; the other four diverge **on purpose** (TMDB matching strips
subtitles; the fallback-enrichment one also strips "a/an"). Because the four
accidental copies aren't shared, a fix to title hygiene in one scraper path
silently doesn't apply to the season linker or cleanup script, causing
inconsistent dedup/matching. This plan unifies **only the equivalent copies**
behind one tested helper, leaving the intentionally-different ones alone but
clearly named, so the matching primitive has one source of truth.

## Current state

There are 8 implementations. **Read each before changing anything** — the
divergences are the whole point:

1. `src/scrapers/pipeline.ts:66` — **the canonical, most-correct one.** NFKD
   decompose + strip diacritics, Unicode-aware `\p{L}\p{N}`, calls `cleanFilmTitle`:
   ```ts
   export function normalizeTitle(title: string): string {
     return cleanFilmTitle(title)
       .normalize("NFKD")
       .replace(/[̀-ͯ]/g, "")
       .toLowerCase()
       .replace(/^the\s+/i, "")
       .replace(/[^\p{L}\p{N}\s]/gu, "")
       .replace(/\s+/g, " ")
       .trim();
   }
   ```
2. `src/scrapers/seasons/season-linker.ts:29` — simple `\w`, **no diacritics, no
   cleanFilmTitle**. Accidental divergence. → CONSOLIDATE.
3. `src/scrapers/seasons/pipeline.ts:326` — identical to #2. → CONSOLIDATE.
4. `src/db/cleanup-films.ts:27` — `cleanFilmTitle` + `\w`, no diacritics. → CONSOLIDATE.
5. `src/agents/fallback-enrichment/confidence.ts:51` — strips `^(the|a|an)\s+`
   (note **a/an**), `\w`. **Intentional difference** (broader article stripping
   for fuzzy confidence scoring). → LEAVE; rename locally to `normalizeForConfidence`.
6. `src/lib/tmdb/match.ts:70` — strips parentheticals AND subtitle-after-colon,
   normalizes quotes/dashes. **Intentional** (TMDB fuzzy match). → LEAVE; rename
   locally to `normalizeForTmdbMatch`.
7. `src/lib/letterboxd-import.ts:97` — strips parentheticals, normalizes
   quotes/dashes, keeps `'`/`-`. **Intentional** (Letterboxd CSV titles). → LEAVE.
8. `src/lib/qa/utils/title-utils.ts:6` — like #7 + subtitle removal. **Intentional**
   (QA tooling). → LEAVE.

The safe consolidation target is the canonical #1. Copies #2, #3, #4 must adopt
it **without changing their observable dedup behavior** — which is exactly what
the characterization tests in Step 1 guard.

Conventions to match:
- Shared pure helpers live in `src/lib/` or alongside their domain. `cleanFilmTitle`
  and the canonical `normalizeTitle` are already exported from
  `src/scrapers/pipeline.ts` — prefer extracting both into a dedicated module
  (e.g. `src/scrapers/utils/title-normalize.ts`) rather than importing from the
  large `pipeline.ts` everywhere.
- Tests are colocated as `*.test.ts` and run with Vitest.

## Commands you will need

| Purpose   | Command                                                        | Expected |
|-----------|----------------------------------------------------------------|----------|
| Typecheck | `npx tsc --noEmit`                                             | no new `src/` errors |
| Tests     | `npm run test:run`                                             | all pass |
| Lint      | `npm run lint`                                                  | exit 0, 0 errors |
| Find copies | `grep -rn "function normalizeTitle" src --include='*.ts'`    | (used to confirm count) |

## Scope

**In scope**:
- `src/scrapers/utils/title-normalize.ts` (create — houses the canonical helper + `cleanFilmTitle` re-export or move).
- `src/scrapers/utils/title-normalize.test.ts` (create — characterization tests).
- `src/scrapers/pipeline.ts` — re-export from the new module (keep the public name working).
- `src/scrapers/seasons/season-linker.ts`, `src/scrapers/seasons/pipeline.ts`,
  `src/db/cleanup-films.ts` — replace local copies with an import of the canonical helper.
- `src/agents/fallback-enrichment/confidence.ts` — rename local copy to `normalizeForConfidence` (no behavior change).
- `src/lib/tmdb/match.ts` — rename local copy to `normalizeForTmdbMatch` (no behavior change).

**Out of scope** (do NOT change behavior):
- `src/lib/letterboxd-import.ts` and `src/lib/qa/utils/title-utils.ts` — these
  have their own exported `normalizeTitle` with intentional semantics and their
  own tests (`letterboxd-import.test.ts`, etc.). Leave them entirely.
- Any change to `cleanFilmTitle`'s behavior.

## Git workflow

- Branch: `refactor/unify-normalize-title`
- Conventional commits (`refactor(scrapers): single source of truth for normalizeTitle`).
- Do NOT push or open a PR unless instructed. Update both changelogs.

## Steps

### Step 1: Characterization tests FIRST (lock current behavior)

Before moving any code, create `src/scrapers/utils/title-normalize.test.ts` and
pin the canonical `normalizeTitle` (the one currently at `pipeline.ts:66`)
against a corpus of real cinema titles, including: diacritics (`"Amélie"` →
`"amelie"`), leading "The", punctuation, 4K/anniversary suffixes that
`cleanFilmTitle` handles, and Unicode. Run it against the **current** import
from `pipeline.ts` so the baseline is green before refactoring.

**Verify**: `npx vitest run src/scrapers/utils/title-normalize.test.ts` → all pass.

### Step 2: Extract the canonical helper into its own module

Create `src/scrapers/utils/title-normalize.ts` exporting `normalizeTitle` (and
`cleanFilmTitle` if it currently lives in `pipeline.ts`). In `pipeline.ts`,
replace the local definition with a re-export so existing importers of
`pipeline.ts`'s `normalizeTitle` keep working unchanged. Point the
characterization test at the new module.

**Verify**: `npx vitest run src/scrapers/utils/title-normalize.test.ts src/scrapers/pipeline.test.ts` → all pass.

### Step 3: Migrate the three equivalent copies

In `season-linker.ts`, `seasons/pipeline.ts`, and `db/cleanup-films.ts`: delete
the local `normalizeTitle` and import the canonical one. **This changes their
normalization** (adds diacritic-folding + `cleanFilmTitle`). That is the intended
improvement, but it can change matching results — so add a focused test for each
that asserts a representative title still links/matches as expected (e.g. a
season-linker test that "Amélie" matches a season raw title "Amelie"). If a
migration would change an existing passing test's expectation, STOP and report.

**Verify**: `npm run test:run` → all pass (existing + new per-site tests).

### Step 4: Rename the two intentional copies (no behavior change)

In `confidence.ts` rename `normalizeTitle` → `normalizeForConfidence`; in
`tmdb/match.ts` rename → `normalizeForTmdbMatch`. Update local callers. These are
pure renames — behavior identical.

**Verify**: `grep -rn "function normalizeTitle" src --include='*.ts'` returns
**only** the canonical module, plus `letterboxd-import.ts` and `qa/utils/title-utils.ts`
(the two intentionally-separate exported ones). i.e. 3 total, down from 8.

### Step 5: Update changelogs.

**Verify**: `git status` shows both changelog files touched.

## Test plan

- `src/scrapers/utils/title-normalize.test.ts` (new): the characterization corpus
  from Step 1 — diacritics, "The" prefix, punctuation, suffix cleaning, Unicode,
  empty/whitespace input.
- Per-site regression: one test each near `season-linker`, `seasons/pipeline`,
  `cleanup-films` proving a diacritic title now normalizes consistently.
- Pattern to follow: `src/scrapers/pipeline.test.ts` (already tests `normalizeTitle`/`cleanFilmTitle`).
- Verification: `npm run test:run` → all pass.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` → no new `src/` errors
- [ ] `npm run lint` → exit 0, 0 errors
- [ ] `npm run test:run` → all pass; characterization + per-site tests exist
- [ ] `grep -rcn "function normalizeTitle" src --include='*.ts'` → exactly 3 definitions remain (canonical module, `letterboxd-import.ts`, `qa/utils/title-utils.ts`)
- [ ] No change to `letterboxd-import.ts` or `qa/utils/title-utils.ts` (`git diff` shows them untouched)
- [ ] Both changelog locations updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Migrating a copy (Step 3) flips an existing passing test from green to red —
  that means the behavior change is observable somewhere you must understand first.
- The canonical `normalizeTitle` excerpt no longer matches `pipeline.ts:66` (drift).
- `cleanFilmTitle` is not exported/available where you need it and extracting it
  would require touching more than the in-scope files.
- You find a 9th copy not listed here — report the location.

## Maintenance notes

- New title-matching code must import the canonical helper, not hand-roll a copy.
  Consider an ESLint note or a comment in the module discouraging new copies.
- A reviewer should confirm the two renamed functions (`normalizeForConfidence`,
  `normalizeForTmdbMatch`) are byte-for-byte the old logic — the rename must not
  sneak in the canonical behavior, since those paths intentionally differ.
- Deferred: deciding whether `letterboxd-import` / `qa` normalizers should also
  fold into a small family of named variants — left out to keep this low-risk.
