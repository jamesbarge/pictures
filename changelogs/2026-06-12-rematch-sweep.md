# Unmatched re-match sweep + preventive blocklist + decoration suffixes (plan 008)

**PR**: pending
**Date**: 2026-06-12

## Changes

### Title cleaner (step 1, post-#666 remainder)
- `cleanFilmTitleWithMetadata` now strips `(Subbed)` / `(Dubbed)` and bare
  `(4K)` decoration suffixes.
- Suffix stripping runs to fixpoint (max 3 passes) so stacked decorations
  resolve fully: "AKIRA (2026 Re-release) (Subbed)" → "AKIRA".
- Stripped trailing `(YYYY)` years and decoration years ("(2026 Re-release)")
  are no longer discarded: the result carries `extractedYear`, with a plain
  trailing release year winning over a decoration year on collision. The
  pipeline keeps consuming `(YYYY)` from the raw title as before (the less
  invasive option the plan offered); the sweep consumes `extractedYear`.

### Preventive blocklist at cache init (step 2)
- New `isBlockedTmdbId()` export in `src/lib/tmdb/blocklist.ts`.
- `initFilmCache` no longer indexes films carrying a blocklisted (known
  wrong) TMDB id in `byTmdbId` — a recorded-wrong id can never be reused by
  tmdb-id lookups. The `byTitle` entry is intentionally kept so same-title
  screenings keep linking to the existing row instead of spawning duplicate
  film rows (the trap the plan warned about; test written before the code).
- Logs once per run: `N cached films carry blocklisted TMDB ids — they will
  be re-matched on next encounter`.

### Re-match sweep (step 3)
- New `src/scripts/rematch-unmatched-films.ts` (`npm run rematch:unmatched`),
  default-dry, `--execute` to apply, `--limit N` to cap.
- Sweeps films with `tmdb_id IS NULL`, `content_type='film'`, and >= 1
  upcoming screening; cleans titles; flags suspected non-films (audit
  patterns + live-broadcast keywords + patrol learnings — flag only, never
  auto-reclassified); matches via the plan-005 matcher (0.6 floor and
  blocklist filtering built in; ambiguity gate bypassed per the
  enrich-upcoming-films precedent since dry-run review is the safeguard).
- UPDATE path: in-place enrichment with full TMDB data, audit trail
  (`match_strategy='rematch-sweep'`, confidence, matchedAt) and
  `letterboxd_url=https://letterboxd.com/tmdb/{id}`.
- MERGE path: when another row already owns the tmdb_id, repoints
  screenings/season_films/user_film_statuses and deletes the empty row —
  cleanup-duplicate-films logic in one transaction, with an explicit
  repoint-before-delete verification.
- TMDB paced at ~3 req/s with 429 backoff (2s/5s/15s, then abort).
- Derived-year second-chance pass (anchor fix): hint-less classics like
  "Aliens"/"Adaptation" (year NULL in prod) fail the primary match because
  franchise siblings trigger the competition penalty (0.73 − 0.15 = 0.58 <
  0.6 floor). When the primary match returns nothing AND no year hint
  existed, the sweep picks a dominant exact-title candidate from raw search
  results (strict equality, past-year only, popularity ≥ 2, ≥ 5x dominance —
  ambiguous same-title pairs like "Dracula" stay unresolved) and re-runs the
  real matcher with that year; the result is accepted only if the matcher
  independently returns the same tmdb id at/above the unchanged floor.
  Derived-year rows are marked "DERIVED year — review" in dry output.

### Pipeline wire-up (step 4)
- `run-scrape-and-enrich.ts` gains an optional post-enrichment phase running
  the sweep in `--execute --limit 100` mode, gated behind
  `SCRAPE_REMATCH_SWEEP=1` — default OFF until the operator has watched a
  few manual runs.

## Impact
- ~200 currently-unmatched upcoming films become re-matchable; the dry run
  is the review artifact before any write.
- Wrong TMDB ids recorded in the blocklist can no longer be served forever
  from the per-run film cache.
- Sanity anchors: Aliens → tmdb 679 and Adaptation → tmdb 2757 verified in
  the production dry run (via the derived-year pass). The third anchor's
  input row ("CAMP CLASSICS presents Barbarella") no longer exists unmatched
  in prod — Barbarella (1968, tmdb 8069) is already matched; the cleaner
  acceptance test proves the prefix strip, and the same title arriving again
  would MERGE into the existing row.
