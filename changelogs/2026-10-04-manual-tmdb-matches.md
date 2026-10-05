# Apply judged TMDB matches from a mapping file

**PR**: #774
**Date**: 2026-10-04

## Changes
- `scripts/apply-manual-tmdb-matches.ts`: default-dry, `--execute` to apply, `--file=<mapping.json>`. The file carries `match` (exact `films.title` -> TMDB id) and `reclassify` (exact title -> `film` | `concert` | `live_broadcast` | `event`); other keys are ignored so review notes can travel with it.
- Only rows with `tmdb_id IS NULL` and at least one upcoming screening are touched.
- Rows mapped to the same id collapse onto one film: the existing owner of that id, else the mapped row with the most upcoming screenings (a shorter title wins a tie, since it usually lacks event debris).
- A row keeps its scraped title unless TMDB's title normalizes to the same `normalizeTitle` key. The film cache keys on that value, so a retitle that changed it would make the next scrape create a fresh unmatched row and move the screenings onto it.
- Every id is fetched from TMDB and checked against the global blocklist before anything is written. The blocklist lives in the gitignored `.claude/data-check-learnings.json`, so `--execute` now refuses to run when that file is missing (the first runs came from a worktree without it; a post-hoc check found none of the 203 ids on the blocklist). Writes record `match_strategy = 'claude-code-manual'` and `match_confidence = 1.0`, which keeps them out of data-check's low-confidence review queue.
- Review hardening: `executeUpdate` now only fills rows that are still unmatched (`tmdb_id IS NULL`, throws otherwise), merges into a keeper whose update failed are skipped, reclassify titles that match no row are reported, and the dry run flags merges that change the cache key.
- `src/scripts/rematch-unmatched-films.ts`: `executeUpdate`, `executeMerge` and their action types are exported; `UpdateAction` gains optional `title` and `strategy` overrides that default to the previous behaviour.
- Registered in `scripts/destructive-script-guards.test.ts`; planner and title rule covered by `scripts/apply-manual-tmdb-matches.test.ts`.

## Impact
- First run (2026-10-04) after a Claude Code review of all 534 unmatched upcoming films: 131 updates, 71 merges into existing or sibling rows, and 69 rows reclassified (Met Opera, Royal Ballet and NT Live broadcasts; quizzes, talks, reading groups and marathons as events). 0 failures.
- Upcoming `film` rows with TMDB data: 62.8% -> 79.5%; posters 72.0% -> 84.2%; synopses 62.4% -> 79.0%.
- Future screenings on films with no TMDB data: 4,151 of 8,540 (48.6%) -> 362 (about 4%).
- **Durability caveat:** updates survive re-scrapes, but a merge deletes the row carrying the venue's title key. A review found 67 of 68 merged venue titles have no row with their key, so the next scrape would re-create unmatched rows for about 316 screenings (63 titles) unless the title cleaner or a cache alias routes them to the merge target. Those fixes are on a separate branch; until it lands, re-running this script with the same mapping file re-merges the re-created rows.
- The cause of the biggest gap is addressed separately in the matcher: the pipeline drops current-year hints, so the ambiguity guard cannot tell a new wide release (Digger, Verity, Sense and Sensibility) from older films with the same title. This tool covers the residue that needs judgement.
