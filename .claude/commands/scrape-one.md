# Scrape — Manual scrape trigger with before/after DB check

You are running a single cinema scraper manually on behalf of the user. For unified scrape+enrichment across all cinemas, use `/scrape` instead — this command is for fast iteration on a single scraper during development.

The argument supplied (if any) is in `$ARGUMENTS`. Treat empty string as "no argument".

## Step 1: Parse the argument

| Arg | Action |
|---|---|
| (empty) | Print the menu (Step 2) and STOP — do not run anything until the user picks |
| `list` | Print the menu (Step 2) and STOP |
| `all` | Confirm with user (warning: 30-60 min, hits all cinemas), then run `scrape:all` |
| `sweep` | Run the daily-sweep job (post-scrape enrichment: TMDB matching, posters, dq cleanup) |
| `<name>` | Look it up in the npm scripts as `scrape:<name>`. If not found, suggest closest match from the menu and STOP |

## Step 2: Menu (when no arg or `list`)

Read `package.json`'s `scripts` field, filter keys starting with `scrape:`, and present them grouped:

- **Independents (small/fast):** lexi, rio, ica, regent-street, nickel, peckhamplex, electric, garden, close-up, cine-lumiere, castle, castle-sidcup, arthouse, phoenix, rich-mix, riverside, olympic, david-lean, coldharbour-blue, genesis
- **Independents (larger):** bfi, pcc, barbican
- **Chains (slowest, ~10-20 min each):** curzon, picturehouse, everyman
- **Groups:** chains, independents, all
- **Other:** sweep (daily enrichment, no scraping), bfi-pdf, bfi-changes, bfi-seasons

Suggest `/scrape lexi` as the safest first run (~30 sec, small cinema, exercises the full pipeline).

## Step 3: Pre-flight (only when actually running)

Capture the BEFORE state — paste these into a single Bash invocation:

```bash
cd /Users/jamesbarge/code/pictures && npx tsx --env-file=.env.local -e "
import { db } from './src/db';
import { scraperRuns, screenings } from './src/db/schema';
import { sql, desc } from 'drizzle-orm';
const r = await db.select().from(scraperRuns).orderBy(desc(scraperRuns.createdAt)).limit(3);
const c = await db.select({ n: sql\`count(*)::int\` }).from(screenings);
console.log('LATEST_RUNS', JSON.stringify(r.map(x => ({ cinema: x.cinemaId, status: x.status, count: x.screeningCount, at: x.createdAt })), null, 2));
console.log('SCREENINGS_TOTAL', c[0].n);
process.exit(0);
"
```

Store the screenings total and the latest run ID/timestamp — you'll diff against these in Step 5.

## Step 4: Run the scraper

Run the npm script in the foreground (NOT background — the user wants to see live output). Use a 30-minute timeout for single cinemas, 90 minutes for `all`.

```bash
cd /Users/jamesbarge/code/pictures && npm run scrape:<target>
```

Stream the output. Don't truncate. If it errors, report the last 30 lines verbatim.

## Step 5: Verify (after the run)

Re-run the same query as Step 3. Show the user:

1. **New scraper_runs row(s)** — cinema_id, status (success/anomaly/failed), screening_count, duration if available
2. **Screenings delta** — `(after - before)` total. Note: this can be negative if the scraper deleted past-dated screenings.
3. **Status interpretation:**
   - `success` + non-zero count = healthy
   - `success` + zero count = anomaly (probably broken silently — flag for follow-up)
   - `anomaly` = scraper detected its own oddity (e.g., baseline regression)
   - `failed` = uncaught exception, look at the run's error field

If the run is the user's first local scrape and status looks healthy, congratulate them and offer the next steps:
- Run another cinema, OR
- Run `/scrape` for the unified weekly scrape+enrichment across all cinemas

## Step 6: Report

Final summary in this format:

```
Target:        <cinema or group>
Duration:      <wall-clock>
Status:        <success / anomaly / failed>
Screenings:    <before> → <after> (Δ <delta>)
Run ID:        <scraper_runs.id>
Notes:         <any anomaly reason, error message, or "clean run">
```

## Important Notes

- **Never use `--apply` flags or destructive subcommands** unless the user already approved them in this session.
- **Don't background the npm run** — first-time local validation needs visible output.
- **If a cinema is in the BFI IMAX known-broken list** (`tasks/bfi-imax-regression-2026-04-28.md`), warn before running.
- **Ollama is optional** — if `OLLAMA_URL` isn't set or Ollama isn't running, vision-mode cinemas (Phoenix, Barbican) will fail soft to HTML parsing. That's expected.
- **Database writes** happen as part of the scrape pipeline — the new screenings, scraper_runs row, and any normalized titles are persisted on success. There's no `--dry-run` for individual scrapers.
