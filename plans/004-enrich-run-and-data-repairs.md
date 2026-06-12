# Plan 004: Run the missed enrichment phase and repair known-bad production data

> **Executor instructions**: Follow step by step. This plan is mostly
> *operational* (scripts + SQL against prod), not code. Run every
> verification and honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm `npm run scrape:unified -- --skip-scrape`
> exists in `package.json` scripts (it maps to `src/scripts/run-scrape-and-enrich.ts`)
> and that `src/scripts/_bfi_reconcile.ts` is present. If either is missing, STOP.

## Status

- **Priority**: P0 (operational)
- **Effort**: S–M (mostly wall-clock waiting + careful SQL)
- **Risk**: MED (writes to production data; every write step has a dry preview)
- **Depends on**: none (but see step 1 caveat re: DB load)
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

The 2026-06-11 evening scrape runs added ~521 screenings and dozens of new
films but **both runs wedged before the enrichment phase**, so new films
(e.g. Phoenix's 22 added, BFI's 54 added) lack TMDB metadata, posters, and
Letterboxd ratings. Separately, the audit confirmed five concrete data
errors live in production, ~64 BFI phantom rows polluting the calendar, and
three venues needing investigation.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Enrichment only | `npm run scrape:unified -- --skip-scrape` | completes in ~15–30 min |
| DB query (ad hoc) | `npx tsx --env-file=.env.local -e "<script>"` | NOTE: wrap in async IIFE — top-level await fails under CJS eval |
| BFI reconcile (dry) | `npx tsx --env-file=.env.local src/scripts/_bfi_reconcile.ts` | prints plan, deletes nothing (default-dry) |

## Steps

### Step 1: Run the enrichment phase

```bash
cd /Users/jamesbarge/code/filmcal2 && npm run scrape:unified -- --skip-scrape
```

Watch the output. **If no log lines appear for 5+ minutes and the process
sits at 0% CPU, it has wedged** (known failure mode, see
`plans/001-scrape-run-circuit-breaker.md`): kill the process tree and retry
once. If it wedges twice, STOP and report — do not loop.

**Verify**: afterwards, count un-enriched recent films; expect near zero:

```bash
npx tsx --env-file=.env.local -e "
import { db } from './src/db';
import { sql } from 'drizzle-orm';
(async () => {
  const r = await db.execute(sql\`
    SELECT count(*)::int AS missing FROM films f
    WHERE f.created_at > now() - interval '2 days'
      AND f.tmdb_id IS NOT NULL AND f.synopsis IS NULL\`);
  console.log(r[0]); process.exit(0);
})();"
```

### Step 2: Fix the five confirmed bad records

For each, use the existing admin/maintenance path if one exists; otherwise
direct SQL. **Print the row before and after each update.**

1. **Joyland** (film id `f216ce18-fe63-4ea0-a4cf-8474f3efa720`, currently
   tmdb 1005825 = Kansas amusement-park doc). Correct film: Saim Sadiq's
   *Joyland* (2022) — verify its TMDB id by searching TMDB for
   "Joyland 2022 Saim Sadiq" before writing. Update `tmdb_id`, `year`,
   `directors`, `synopsis`, `poster_url`, `letterboxd_url` (set to
   `https://letterboxd.com/tmdb/<correct-id>` and let enrichment resolve),
   and **set `match_confidence = 1.0, match_strategy = 'manual'`**.
2. **Film Club: Persepolis** (id `4d308f9e-e161-4e63-a3fa-2a7a1e4f0ec6`,
   tmdb 322021 = archaeological site). Correct: *Persepolis* (2007),
   tmdb **7457** (already recorded in `.claude/data-check-learnings.json`).
3. **Blood Tea and Red String** (id `0c1b751d-0a05-4098-8bfe-baaee8b73558`):
   tmdb match is correct; fix `year` 1968 → **2006**.
4. **Audition • 4K Restoration** (id `36bdd4d5-bf7d-437c-a993-d2c576744cf0`):
   fix `year` 2000 → **1999**.
5. **The Labours of Hercule: Poirot** (id
   `e25c1a91-0ad3-4047-bd03-c5485ad0822d`): TV content. Set
   `content_type = 'event'`, null the `tmdb_id` (1669246) and
   `letterboxd_url` (`/film/poirot/` is wrong).

Then add entries for #1 and #2 to `.claude/data-check-learnings.json`
(`wrongTmdbMatches` — format: normalized title key → `{wrong, correct, year, note}`)
so the blocklist prevents recurrence.

**Verify**: re-select all five rows; confirm new values. Check
pictures.london (the production calendar) shows the right *Joyland* poster.

### Step 3: Verify three suspects before touching them

For each, check the venue's actual website programme, then decide:

- **"Screening"** at JW3 (tmdb 766878, confidence 0.620) — almost certainly
  a scrape artifact title. If JW3's site shows a real film at the matching
  datetime, retitle + rematch; if it's a placeholder, set
  `content_type='event'` and null tmdb fields.
- **"Blood"** at Close-Up (tmdb 213515, 1998 V-cinema, confidence 0.621) —
  Close-Up's site is currently unreachable (see step 5); check their
  programme via Google cache/Wayback if needed.
- **"Still Burning"** (tmdb 550525 but year stored 2026) — if the SLF doc is
  right, fix year to its true release year; if not, null the match.

### Step 4: Run the staged BFI reconcile sweep

```bash
npx tsx --env-file=.env.local src/scripts/_bfi_reconcile.ts          # dry plan
```

Read the printed plan. Expected scale: ~64 stale legacy-sourceId rows +
~33 near-duplicate pairs at BFI Southbank. **STOP if the plan proposes
deleting >150 rows or anything outside bfi-southbank/bfi-imax** — that
signals drift since the script was staged. Otherwise run with its execute
flag (read the script header for the exact flag name; maintenance scripts
in this repo are default-dry per PR #660).

**Verify**: re-run dry mode → plan is empty/minimal. Spot-check that
Hiroshima Mon Amour / Pixote no longer show triple-booked 19:00/19:10/19:20
phantom slots on the same evening.

### Step 5: Investigate the three broken venues (report, don't fix)

- **Close-Up** (90% recent failure, last good 2026-06-05) and **Cinema
  Museum** (60%, last good 2026-05-28): `curl -sI <site>` from this Mac;
  check for Cloudflare/bot-block status codes. NOTE: Cloudflare blocks
  local *headless* scrapes for some venues — headed `launchPersistentContext`
  is the known workaround pattern. Write findings to the audit doc.
- **The David Lean Cinema** (silent breaker: 5 consecutive zero-yield runs,
  last good **never**): open the venue site, find where screenings actually
  live, and diff against what `src/scrapers/cinemas/` expects. Produce a
  diagnosis paragraph; fixing the scraper is a separate task.

## Done criteria

- [ ] Enrichment phase completed; recent-films missing-synopsis count ≈ 0
- [ ] Five confirmed-bad rows fixed and verified (before/after printed)
- [ ] Two new blocklist entries in `.claude/data-check-learnings.json`
- [ ] BFI reconcile executed; dry re-run shows clean
- [ ] Three-venue investigation findings written into the evaluation doc
- [ ] `plans/README.md` row updated

## STOP conditions

- Enrichment wedges twice (report; needs plan 001 first).
- The reconcile dry plan exceeds the expected scale or scope above.
- Any UPDATE would touch more than one row (your WHERE clause is wrong).
- TMDB search for correct *Joyland* / *Persepolis* ids is ambiguous.
