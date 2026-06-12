# Plan 005: TMDB matcher signals (feat/tmdb-matcher-signals)

Drift check: clean (no in-scope file changed 716e543..HEAD; all excerpts verified 2026-06-12)
findBestMatch callers: only matchFilmToTMDB (2 call sites, both in match.ts) — Step 4 safe.
Registry check: only `cine-lumiere` verifiable for language priors (no goethe-institut id).

- [x] Step 1: persist match audit trail in films INSERT (test first) — 8e36c99
- [x] Step 2: year discipline at matcher boundary — 65a60b5
- [x] Step 3: runtime cross-check (MatchHints.runtime + RawScreening.runtime) — b91d392
- [x] Step 4: director credit tie-break (findBestMatch async) — ec1b8de
- [x] Step 5: venue original-language prior — 010875b
- [x] Step 6: thread hints through pipeline — 2149d8e
- [x] Step 7: changelogs + plans/README row — 6c9e72b

## Review
- All 7 steps complete, TDD style, one commit per step.
- Verification: npm run test:run (113 files / 1721 tests green), npm run lint
  (exit 0, 60 pre-existing warnings, none in touched files), npx tsc --noEmit clean.
- No existing test's expected match outcome flipped.
- Deviation noted: runtime cross-check rejects TMDB runtime 0/null vs feature
  hint (per the plan's test cases; the plan's code snippet skipped runtime 0 —
  contradiction resolved in favour of the stated test expectations since junk
  stubs have runtime 0/null, which is the bug being fixed).
- PR not opened — orchestrator reviews the diff first.
