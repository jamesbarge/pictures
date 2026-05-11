# 100-Film Spot Check — 2026-05-11

## Method

- Sampled the 100 films with the soonest upcoming screening (`MIN(datetime) WHERE datetime >= NOW()`, ordered ASC). These are the films users see first on the calendar.
- For each: read every DB field; cross-referenced TMDB (66/100 had a TMDB ID); checked screening time correctness for BST drift.
- Script: `scripts/_spot-check-100.ts`. Read-only — no DB mutations.

## Headline

- **79 of 100 films are clean.**
- **28 issues across 21 films** — 9 HIGH, 15 MEDIUM, 4 LOW.
- **One major systemic bug discovered**: Everyman chain scraper has a BST timezone bug, producing 348 +1h ghost screenings in the DB (PR #484 fixes the code; cleanup still pending).

## Issues by category

### 1. BST off-by-one-hour at Everyman — SYSTEMIC (PR #484)

Two `Hokum` screenings at Everyman Broadgate flagged in the 00:00–09:59 London window. Tracing booking URLs revealed:

- Same booking URL stored TWICE — once at the correct evening time (scraped tonight under London TZ), once at +1h (scraped overnight at ~03:01 UTC under `TZ=UTC`).
- Bug at `src/scrapers/chains/everyman.ts:458`: `new Date(showtime.startsAt)` interprets a TZ-less ISO string in the runtime TZ. Under UTC cron during BST → +1h ghost. Verified by direct API probe: API returns `"2026-05-12T11:15:00"` (no Z, no offset).
- **Repo-wide query**: 348 upcoming Everyman screenings involved in duplicate sets across all 15 Everyman venues. Picturehouse and Peckhamplex do NOT exhibit this pattern in the same dataset.
- Code fix: PR #484 (replaces with `parseUKLocalDateTime`).
- **Data fix: not done.** Destructive (348 row deletes). Awaiting explicit approval. Pattern: same `(cinema_id, booking_url)` with two `datetime` values exactly 1h apart → drop the later UTC one.

### 2. Programme-strand prefix titles — HIGH (5 films)

The scraper preserved cinema-side programme prefixes in the canonical title, creating duplicate film records.

| Film ID | Stored title | Should be |
|---|---|---|
| `c80431de` | `LONDON PREMIERE Dracula` | Dracula (needs TMDB pick — see patrol-2026-05-07-2022.md note) |
| `43478234` | `UK PREMIERE Phantoms of July` | Phantoms of July |
| `a6ec7b91` | `DocHouse: The Last Spy` | The Last Spy |
| `26f1c171` | `DocHouse: Our Land` | Our Land |
| `bef92830` | `DocHouse: Ultras` | Ultras (TMDB 668195) — patrol fixed this 2026-05-07 then it reappeared. Triple-confirmed Curzon scraper churn. |

These will be caught by the next patrol run alphabetically. Not an action item from this audit.

### 3. Year contamination — HIGH (2 TMDB-verified) + MEDIUM (10)

Scraper filled `year` with the screening year (2026) rather than the film's actual release year.

**TMDB-confirmed wrong** (HIGH):
- `960847a6` Boy and the World — DB year=2026, TMDB=2012
- `8cc63426` Pacific Rim (3D) — DB year=2026, TMDB=2013

**Year=2026 no TMDB** (MEDIUM — opera broadcasts and events that need TMDB matching):
- 3× Eugene Onegin (opera variants)
- Ultras (already merged in patrol but new orphan)
- Our Land, The Last Spy, DocHouse variants
- An Introduction to Brazil on Film
- Rose of Nevada
- Chasing Utopia (has TMDB ID but no year populated — enrichment didn't write)

### 4. Wrong TMDB link — MEDIUM (1)

- `960847a6` Boy and the World — DB title matches "Boy and the World" (2012 Brazilian animation, original title *O Menino e o Mundo*, TMDB 226383). DB TMDB lookup returned title `"Rumblestrips"`. The DB has the wrong TMDB ID attached.

### 5. Other field issues — LOW (4) / MEDIUM (3)

- `b9aca07c` Burning Ambition (1989) — `is_repertory=false` for a 1989 film
- `90bfb662` Superworm — runtime=25 min (likely a short — OK if it's a short film)
- `8c4142f3` Primavera — runtime=10 min (likely a short)
- `03507811` The Wizard of the Kremlin — DB runtime=156 vs TMDB=136
- `50a5166e` Chasing Utopia — has TMDB ID but no poster, no directors, no year (enrichment didn't write or TMDB record is sparse)

## Proposed remediations (require approval)

1. **Delete the 348 Everyman ghost screenings.** Idempotent SQL: for each `(cinema_id, booking_url)` with exactly 2 rows whose datetimes are 1h apart, delete the row with the later UTC datetime. Dry-run first. ~5-line script.
2. **Re-investigate `960847a6` Boy and the World TMDB link.** Look up TMDB 226383 (the actual *Boy and the World* / *O Menino e o Mundo*) and update the row.
3. **Trust the next patrol pass** for the programme-strand prefix titles and year-contamination cases — that's exactly what the patrol is designed for. Tonight's patrol log shows it's actively fixing this class.
4. **Probe Curzon and Picturehouse chain APIs** for `startsAt` / `Showtime` TZ format. If they're TZ-less like Everyman, same migration applies.

## What this audit validated

- The post-#483 BST fix held for the 6 cinemas I migrated (electric ×2, peckhamplex, close-up, genesis, bfi-southbank — zero 00:00-09:59 outliers).
- The 79% clean rate is consistent with the patrol's recent batch DQS of 88 (2026-05-07-2022). Spot-check finds the same classes of issue the patrol is already chasing.
- The Everyman BST bug is the only finding that requires immediate engineering action beyond the rolling patrol — and PR #484 is on it.
