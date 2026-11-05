# Data Check v3 — Iterative Data Quality Patrol

Data quality patrol agent for pictures.london. Each invocation: run audit, apply safe fixes, write Obsidian report, print summary.

## Prerequisites

**AI Booking Verification** requires Stagehand (optional, not in package.json due to CI OOM):
```bash
npm install @browserbasehq/stagehand
```
Without it, booking checks fall back to HTTP HEAD (less accurate for SPA sites like Curzon).

## Phase 0: Context (no tool calls needed)

The script loads `.claude/data-check-learnings.json` automatically. You do NOT need to read it or the previous report — the script handles cursor state internally via Obsidian YAML frontmatter.

**Critical rules:**
- Films with TMDB IDs should NOT be reclassified as events
- `missing_tmdb` where `content_type = 'event'` → skip (false positive)
- BFI Southbank and Ciné Lumière can have legitimately large stale counts
- Stale screening Tier 1 = safe to delete; Tier 2 = needs investigation
- `screening_not_on_website` → advisory only, never auto-delete
- `suspect_wrong_tmdb` → flag for review only, don't auto-correct

## Phase 1: Run Audit

```bash
npx tsx scripts/data-check.ts 2>/dev/null
```

Parse the JSON. If output is too large, pipe through the summary parser:
```bash
npx tsx scripts/data-check.ts 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
from collections import Counter
types = Counter(i['type'] for i in data['issues'])
print('=== ISSUES ===')
for t, c in types.most_common(): print(f'  {t}: {c}')
print(f'Total: {data[\"stats\"][\"issuesFound\"]} | Cursor: {data[\"cursor\"][\"cursorFilmTitle\"]} | {data[\"cursor\"][\"filmsCheckedThisCycle\"]}/{data[\"cursor\"][\"totalFilms\"]}')
skip = {'stale_screening','screening_not_on_website','missing_letterboxd','needs_letterboxd_rating','missing_year','missing_cast'}
act = [i for i in data['issues'] if i['type'] not in skip]
if act:
    print('\nACTIONABLE:')
    for i in act: print(f'  {i[\"type\"]}: {i[\"filmTitle\"]} (id={i[\"filmId\"][:8]})')
d = data['batchDqs']
print(f'\nDQS: {d[\"compositeScore\"]} | TMDB: {d[\"tmdbMatchRate\"]*100:.0f}% | Poster: {d[\"posterCoverage\"]*100:.0f}% | LB: {d[\"letterboxdCoverage\"]*100:.0f}% | Synopsis: {d[\"synopsisCoverage\"]*100:.0f}% | Verify: {d[\"verificationPassRate\"]*100:.0f}%')
for v in data.get('tmdbRevalidations',[]):
    if v['status'] != 'ok': print(f'TMDB SUSPECT: {v[\"filmTitle\"]}: {v[\"status\"]}')
for v in data.get('letterboxdVerifications',[]):
    if v.get('letterboxdUrl'): print(f'LB RESOLVED: {v[\"filmTitle\"]}: {v[\"letterboxdUrl\"]} rating={v.get(\"letterboxdRating\")}')
vc = Counter(v['status'] for v in data.get('cinemaVerifications',[])); print(f'Verify: {dict(vc)}')
bc = data['bookingChecks']
verdicts = Counter(b.get('verdict','http_only') for b in bc)
verified = sum(1 for b in bc if b.get('verdict') == 'verified')
print(f'Booking: {verified}/{len(bc)} verified | {dict(verdicts)}')
for b in bc:
    if b.get('verdict') and b['verdict'] != 'verified':
        print(f'  BOOKING ISSUE: [{b[\"verdict\"]}] {b[\"cinemaName\"]}: \"{b[\"filmTitle\"]}\" → extracted=\"{b.get(\"extractedTitle\",\"?\")}\" ({(b.get(\"confidence\",0)*100):.0f}%)')
"
```

If the script fails, report the error and stop.

## Phase 2: Analyze & Fix

**IMPORTANT:** Combine all fixes into ONE script: `scripts/_tmp_patrol.ts`. Use `dotenv.config({ path: ".env.local" })` (NOT `import "dotenv/config"`). The `directors` column is `text[]` — use `array_to_string(directors, ' ') LIKE '% Starring %'`. The `cast` column is `jsonb` — quote it as `"cast"` in SQL.

### Stall detection → reset cursor

If the cursor hasn't moved from the previous run (same `cursorFilmTitle` and `filmsCheckedThisCycle`), **reset the cursor to start a new cycle** by writing an Obsidian report with `cursor_film_title: ""` and incrementing the cycle number. Then continue — run the audit again from the beginning. Do NOT stop or skip.

This ensures the patrol keeps cycling through the database even when no new scrape data has arrived. Each pass catches new issues from films that expired, had screenings added by other cinemas, or need re-verification.

### Safe auto-fixes (NO per-batch cap — fix all)

Previous versions had a "5/batch cap" that caused the same issues to recur across 10+ runs. Remove the cap. Fix everything in one pass:

**1. Stuck enrichment (ALL):**
```sql
UPDATE films SET matched_at = NULL, enrichment_status = NULL, updated_at = NOW()
WHERE enrichment_status = '{}'::jsonb AND tmdb_id IS NOT NULL
AND id IN (SELECT DISTINCT film_id FROM screenings WHERE datetime > NOW())
RETURNING id, title;
```

**2. Directors concat bug (ALL):**
```sql
UPDATE films SET directors = '{}', matched_at = NULL, enrichment_status = NULL, updated_at = NOW()
WHERE array_to_string(directors, ' ') LIKE '% Starring %'
AND id IN (SELECT DISTINCT film_id FROM screenings WHERE datetime > NOW())
RETURNING id, title;
```

**3. TMDB backfill — fetch directly from TMDB API, don't just reset:**
For films with TMDB ID but missing year/synopsis/poster/directors, call the TMDB API directly and populate the data. This eliminates the dependency on the enrichment daily sweep (4:30am UTC) that caused multi-run cursor stalls.

```typescript
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,release_dates`;
```

Update with: year, synopsis, poster_url, backdrop_url, runtime, genres, directors, "cast" (jsonb of `[{name: "..."}]`), imdb_id. Use `COALESCE` to avoid overwriting existing data.

**Idempotency guard (REQUIRED):** the candidate query must include `(matched_at IS NULL OR matched_at < NOW() - INTERVAL '24 hours')`. Without this, films where TMDB itself has nulls (upcoming releases, event-style screenings, foreign titles) re-match every run forever — wasting TMDB API calls and inflating the fix count with no-ops. Set `matched_at = NOW()` on every successful API call so the guard takes effect on the next pass.

**Year=0 normalization:** `Number("")` returns `0`, so when TMDB has no `release_date` we end up writing `year=0` and the `year IS NULL` filter never fires again. Always sanitize: `const year = data.release_date && data.release_date.length >= 4 ? Number(data.release_date.slice(0,4)) : null;`. If you find existing rows with `year = 0` or `year < 1900`, fix them to NULL in the same patrol pass.

**Postgres type pitfalls (we have hit these):**
- `films.id` is `text`, NOT `uuid`. Never cast `${id}::uuid` in queries against `films.id` — it errors with `operator does not exist: text = uuid`.
- `films.year` is `integer`. When passing `null` via postgres.js template literals, cast explicitly: `COALESCE(year, ${year}::int)` — otherwise null binds as `text` and the COALESCE fails type-check.
- `films."cast"` is `jsonb` but may be a scalar (not an array). Guard with `jsonb_typeof("cast") <> 'array'` before calling `jsonb_array_length`.

**Order of operations: title fixes BEFORE TMDB ID writes.** A common bug: after `setTmdbId(filmId, tmdbId)`, calling `SELECT id FROM films WHERE tmdb_id = ${tmdbId}` will find the film you just updated (since you set its tmdb_id moments ago). If you guard a follow-up title rename on "is this TMDB ID already used by another film?", the guard will incorrectly fire and skip the rename. Fix: do title fixes FIRST, then set the TMDB ID; or check `WHERE tmdb_id = ${tmdbId} AND id <> ${filmId}` for the conflict-detection query.

**4. Known non-film reclassification** (no TMDB ID, clearly not a film).

**5. Duplicate film merges** (same title, one with TMDB, one without):
Move screenings, user_film_statuses, season_films (composite key: `season_id + film_id`), then delete orphan.

**Screening-tag suffix variants:** scrapers sometimes append a screening-format tag to the title and create a new film row instead of attaching it as a screening attribute. Common suffixes: `(VHS SCREENING)`, `(35mm)`, `(70mm)`, `(IMAX)`, `(Q&A)`, `(WITH INTRO)`. When you encounter a `missing_tmdb` issue whose title ends in such a suffix, strip the suffix and attempt a TMDB match. If the match collides with an existing film (`films_tmdb_id_unique` violation), that confirms it is a duplicate of the canonical entry — merge instead.

**Merge transaction template** (handles the conflicts that bit us before):

Three tables have unique constraints that fire on bulk reassignment:
- `screenings` has `idx_screenings_unique (film_id, cinema_id, datetime)`
- `user_film_statuses` has `UNIQUE (user_id, film_id)`
- `season_films` has PK `(season_id, film_id)`

A naive `UPDATE ... SET film_id = canonical WHERE film_id = orphan` will throw `23505 duplicate key` whenever the canonical film is already attached at the same key. **Always loop per-row** and drop the orphan row when the canonical already has it.

```typescript
await sql.begin(async (tx) => {
  // screenings: per-row check, NOT a bulk UPDATE
  const scr = await tx`SELECT id, cinema_id, datetime FROM screenings WHERE film_id = ${ORPHAN}`;
  for (const r of scr) {
    const exists = await tx`SELECT 1 FROM screenings WHERE film_id = ${CANONICAL} AND cinema_id = ${r.cinema_id} AND datetime = ${r.datetime}`;
    if (exists.length) await tx`DELETE FROM screenings WHERE id = ${r.id}`;
    else await tx`UPDATE screenings SET film_id = ${CANONICAL}, updated_at = NOW() WHERE id = ${r.id}`;
  }
  // user_film_statuses: UNIQUE (user_id, film_id)
  const ufs = await tx`SELECT id, user_id FROM user_film_statuses WHERE film_id = ${ORPHAN}`;
  for (const r of ufs) {
    const exists = await tx`SELECT 1 FROM user_film_statuses WHERE user_id = ${r.user_id} AND film_id = ${CANONICAL}`;
    if (exists.length) await tx`DELETE FROM user_film_statuses WHERE id = ${r.id}`;
    else await tx`UPDATE user_film_statuses SET film_id = ${CANONICAL} WHERE id = ${r.id}`;
  }
  // season_films PK is (season_id, film_id)
  const sf = await tx`SELECT season_id FROM season_films WHERE film_id = ${ORPHAN}`;
  for (const r of sf) {
    const exists = await tx`SELECT 1 FROM season_films WHERE season_id = ${r.season_id} AND film_id = ${CANONICAL}`;
    if (exists.length) await tx`DELETE FROM season_films WHERE season_id = ${r.season_id} AND film_id = ${ORPHAN}`;
    else await tx`UPDATE season_films SET film_id = ${CANONICAL} WHERE season_id = ${r.season_id} AND film_id = ${ORPHAN}`;
  }
  await tx`DELETE FROM films WHERE id = ${ORPHAN}`;
});
```

**6. Stale screening deletion** (Tier 1 only).

**7. Known wrong TMDB correction** (from learnings JSON).

**8. Letterboxd enrichment** (from `letterboxdVerifications` where `status = "resolved"`).

**9. Booking page wrong-film issues** (from AI verification):
When `booking_page_wrong_film` issues appear, the booking URL points to a different film than expected. This usually means the scraper associated a screening with the wrong film entry. Investigate the cinema's page to confirm, then fix the screening's `film_id` or `booking_url`.

### Do NOT auto-fix:
- Missing posters/TMDB for niche titles without clear TMDB match
- `screening_not_on_website` — advisory only
- `suspect_wrong_tmdb` — flag for review only
- `booking_page_wrong_film` — needs manual investigation (the AI verifier flags these but the fix depends on whether the URL or the film association is wrong)
- Tier 2 stale screenings

## Phase 3: Write Obsidian Report

**ALWAYS write a report** (unless stalled). This is how the cursor advances between runs.

Write to: `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Data Quality/patrol-YYYY-MM-DD-HHMM.md`

**Frontmatter accounting rules:**
- `cycle_number`: preserve from the previous report. Only **increment** when `filmsCheckedThisCycle` wraps backwards (i.e., the new value is lower than the previous report's value, signalling a cycle restart). The script self-rotates when it reaches the end. Don't bump it on every run.
- `fixes_applied`: count fixes that actually changed DB state. Idempotent re-attempts that produced **no field changes** (e.g., a `tmdb_backfill` call where TMDB returned null for every missing field, so COALESCE preserved everything) do NOT count. List them under "Unfixed → idempotent re-runs" instead. The summary number must reflect real progress.
- `total_films` will fluctuate (other jobs delete orphan films). Just record what the audit reported.

Keep reports **concise** — the verbose template caused bloat. Use this shorter format:

```markdown
---
cursor_film_title: "<title>"
cursor_film_id: "<id>"
films_checked_this_cycle: <n>
cycle_number: <n>
run_timestamp: "<ISO>"
batch_size: 40
total_films: <n>
issues_found: <n>
fixes_applied: <n>
dqs_score: <score>
---

# Data Quality Patrol — YYYY-MM-DD-HHMM

DQS: **<score>** | TMDB: <n>% | Poster: <n>% | LB: <n>% | Synopsis: <n>%
Verify: <confirmed>/<total> | Booking: <verified>/<total> verified (<error_pages> error, <wrong_film> wrong film)
Films: <checked>/<total> (<pct>%) — Cycle <n>

## Fixes (<count>)

- **<Title>** — <fix_type>: <one-line description>

## Unfixed (if any notable)

<Only list genuinely new issues not seen in previous runs>

## Next: "<cursor title>"
```

## Phase 4: Summary & Cleanup

```bash
rm -f scripts/_tmp_*.ts 2>/dev/null
```

(The glob covers `_tmp_patrol.ts`, `_tmp_merge.ts`, `_tmp_diag.ts`, `_tmp_verify.ts`, etc. Never run helper scripts from `/tmp/` — they fail with `Cannot find module 'dotenv'` because Node module resolution is rooted at the script's directory.)

Print:
```
Data Check v3 — Cycle <n>, <checked>/<total> (<pct>%)
DQS: <score> | Issues: <found> found, <fixed> fixed
Booking: <verified>/<total> verified (<errors> error, <wrong> wrong film)
Next: "<cursor>"
```

## Phase 5: Update Learnings (rare)

Only when you discover NEW patterns:
- New non-film title pattern → `knownNonFilmTitles`
- New wrong TMDB match → `wrongTmdbMatches`
- New cinema quirk → `cinemaQuirks`

Most runs need no learnings updates.

## Hard Rules

- **DB access**: `import * as dotenv from "dotenv"; dotenv.config({ path: ".env.local" }); import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!, { prepare: false });`
- **Date serialization**: Always `.toISOString()` in sql template literals
- **No per-batch caps**: Fix everything found. The old 5/batch cap caused 10+ runs of the same issues.
- **Direct TMDB backfill**: Don't just reset enrichment — fetch from TMDB API and populate. This prevents cursor stalls.
- **Idempotency-with-progress**: All re-runnable fix queries must include a guard that excludes recently-attempted rows (`matched_at IS NULL OR matched_at < NOW() - INTERVAL '24 hours'`). Setting `matched_at = NOW()` after each attempt is part of the fix, not optional.
- **Stall detection**: If cursor unchanged, print stall message and stop. Don't write empty reports.
- **TMDB ID = real film**: Never reclassify a film with a TMDB ID as an event
- **Stale screening safety**: Never delete by film_id + cinema_id alone
- **Cinema verification is advisory**: Never auto-delete based on `screening_not_on_website`
- **season_films has no `id` column**: Use composite key `(season_id, film_id)` for merges
- **`films.id` is `text`**, not `uuid`. Never write `${id}::uuid` in queries against `films.id`.
- **`films.year` is `integer`**: cast nulls when binding (`COALESCE(year, ${val}::int)`), and never let `Number("")` reach the DB — sanitize TMDB `release_date` to null when missing.
- **`films."cast"` may be a non-array jsonb scalar**: guard `jsonb_array_length` calls with `jsonb_typeof("cast") = 'array'`.
- **Helper scripts go in `scripts/_tmp_*.ts`**, never in `/tmp/` (Node module resolution breaks on `dotenv` lookups outside the project).
- **Cleanup is a glob**: `rm -f scripts/_tmp_*.ts` — covers patrol, merge, diag, verify, and any other helpers spun up.
- **`fixes_applied` accounts for real DB changes only**: idempotent re-runs that produced no field changes are reported under "Unfixed → idempotent re-runs", not as fixes.
- **NEVER hardcode TMDB IDs from memory.** Always verify by hitting `https://api.themoviedb.org/3/movie/${id}?api_key=...` and confirming `title` + `release_date` match the expected film BEFORE writing it to the DB. Memory is unreliable: e.g., I confidently asserted Daisies (Sedmikrásky, 1966 Chytilová) was TMDB 1422 — it's actually 46919. TMDB 1422 is The Departed (2006 Scorsese). My patrol script merged a Daisies screening into The Departed before this rule existed. Always: search TMDB by title with `tmdbSearch(query, year)` and grab the id from results, OR verify the hardcoded ID via `/movie/${id}` first. **One bad hardcoded ID can corrupt user data via merge.**
