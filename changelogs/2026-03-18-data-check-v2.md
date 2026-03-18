# Data Check v2 — Compounding Intelligence for Screening Accuracy

**Date**: 2026-03-18

## Changes

### Phase 1: Structured Learnings (Foundation)
- Created `.claude/data-check-learnings.json` with machine-readable knowledge base
- 10 known wrong TMDB matches, 24 non-film patterns, 3 cinema quirks
- Script loads JSON at startup and applies to detection logic automatically
- `usedCount` tracking for learning effectiveness measurement

### Phase 2: Letterboxd IMDB Bridge
- New Phase C4: TMDB -> IMDB -> Letterboxd redirect chain for URL resolution
- Scrapes Letterboxd ratings from resolved pages
- Title safety verification (Levenshtein > 0.5) prevents wrong matches
- Also refreshes ratings for films with URL but no rating
- Caps: 15 enrichment lookups + 10 rating refreshes per run

### Phase 3: TMDB Match Accuracy
- **3A**: New `src/lib/tmdb/blocklist.ts` module loads wrong-match lookup from learnings JSON
- **3B**: Classic film year preference in `match.ts` — 0.3 year bonus (up from 0.2) for pre-2000 films, -0.1 penalty for >10yr mismatch, 0.85 confidence floor for >5yr mismatch
- **3C**: TMDB re-validation phase checks low-confidence matches against TMDB API (year + director comparison)

### Phase 4: Cinema Website Verification
- 10 cinema verifiers: Rio, ICA, Barbican, Close-Up, Genesis, Rich Mix + Curzon/Picturehouse/Everyman chains
- Each verifier is a lightweight read-only check against the cinema's listing page
- Advisory only — `screening_not_on_website` never triggers auto-deletion
- 3-minute hard timeout, 500ms rate limiting between checks

### Phase 5: Time Budget Extension
- Per-phase timing with `timePhase()` / `isOverBudget()` infrastructure
- 15-minute hard cap (up from ~3 min)
- DETAIL_PAGE_VISITS increased from 3 to 10
- Each phase has its own timeout and skips remaining items if over budget

### Phase 6: DQS Tracking
- Batch Data Quality Score computed per run (weighted 0-100)
- Weights: TMDB 30%, poster 15%, Letterboxd 10%, synopsis 10%, stale rate 20%, verification 15%
- DQS history persisted in learnings JSON (last 50 entries)
- Verifier coverage list maintained automatically

### Skill Updates
- Updated `.claude/commands/data-check.md` for v2 output format
- New Obsidian report sections: DQS, Cinema Verification, TMDB Re-validation, Letterboxd, Phase Timings
- Letterboxd auto-fix from `letterboxdVerifications` where `status = "resolved"`
- Updated summary format with DQS trend

## Impact
- Data quality patrol now verifies accuracy, not just completeness
- Knowledge compounds across runs via structured JSON learnings
- Classic film TMDB matching significantly improved (prevents wrong-decade matches)
- Letterboxd coverage will steadily increase via IMDB bridge
- Cinema verification provides ground-truth signal for phantom screening detection
