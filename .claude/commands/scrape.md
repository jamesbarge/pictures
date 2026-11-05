# Scrape v2 — every cinema, ≥30 days ahead, enriched by Claude Code

Runs the full pipeline: scrape every active cinema (independents first, chains in parallel), L-CUT gap-fill, deterministic enrichment, then **you** (Claude Code) review what's left and apply judged fixes. Writes a run report to Obsidian.

Repo: `/Users/jamesbarge/code/pictures`. Backend: `npm run scrape:unified` (`src/scripts/run-scrape-and-enrich.ts`).

The argument (if any) is in `$ARGUMENTS`; treat empty as no argument.

## How fetching works (context for debugging)
- Every scraper fetches **direct first**.
- A bot block (403/429/503, or a Cloudflare interstitial title) on a `BaseScraper.fetchUrl` page escalates to **Firecrawl** (rawHtml, GB proxy). The code is `src/scrapers/fetch/tiered-fetch.ts`.
- BFI escalates to a **Browserbase** remote browser (`createRemoteBrowserPage` in `src/scrapers/utils/browser.ts`) after its local stealth attempts fail.
- Both paid tiers fail soft when their keys are unset. Both are capped per run: `SCRAPE_FIRECRAWL_MAX_PAGES` (default 300) and `SCRAPE_BROWSERBASE_MAX_SESSIONS` (default 10).
- Per-venue tier usage lands in `scraper_runs.metadata.fetchTiers`.
- Never request Firecrawl's LLM/JSON extraction formats. Interpretation is your job (CLAUDE.md: no hosted LLM).

## Step 1: Parse the argument

| Arg | Action |
|---|---|
| (empty) | Full run: Steps 2–7 |
| `scrape` | `npm run scrape:unified -- --skip-enrich`, then Steps 6–7 (skip 5) |
| `enrich` | `npm run scrape:unified -- --skip-scrape`, then Steps 4–7 |
| `review` | Skip the pipeline; go straight to Step 5 using the existing `tmp/enrichment-gaps.json` (run `npm run enrich:gaps` first if it is older than today) |
| `resume` | `npm run scrape:unified -- --resume`, then Steps 4–7 |
| `health` | Read-only detectors (Step 3b), then stop |
| `status` | Read `tmp/scrape-progress.json` and report the wave/cinema/phase and the age of `lastHeartbeatAt`; warn if older than 10 min. Stop |
| `report` | Re-print the last summary from `tmp/scrape-run-summary.json` (Step 6 format). Stop |
| `one <name>` | Single venue: `npm run scrape -- <name> [venue...]` (`npm run scrape -- --list` shows names). Report the new `scraper_runs` row (status, count, `metadata.fetchTiers`) and the venue's horizon. Stop |
| anything else | Show this table and stop |

## Step 2: Pre-flight (run args only)
Check, without printing values:
```bash
cd /Users/jamesbarge/code/pictures && for k in DATABASE_URL TMDB_API_KEY FIRECRAWL_API_KEY BROWSERBASE_API_KEY BROWSERBASE_PROJECT_ID; do v=$(grep "^$k=" .env.local | cut -d= -f2-); [ -n "$v" ] && echo "$k set" || echo "$k MISSING"; done; grep '^DB_POOL_MAX' .env.local; ls .claude/data-check-learnings.json
```
- **`DATABASE_URL` or `TMDB_API_KEY` missing:** stop.
- **Firecrawl or Browserbase missing:** warn and continue. Blocked venues will fail as before.
- **`DB_POOL_MAX` below 12:** warn. The runner uses 8 independents plus 3 chains concurrently.
- **Learnings file missing:** stop. It holds the TMDB blocklist, and `enrich:apply --execute` refuses to run without it.

Tell the user the full run takes ~30–60 min and that `/scrape status` works from another session.

## Step 3: Run the pipeline
The run outlasts the 10-minute foreground limit, so **run it in the background** and wait for the completion notification. Don't poll:
```bash
cd /Users/jamesbarge/code/pictures && npm run scrape:unified > tmp/scrape-run.log 2>&1
```
Use `run_in_background: true`. While it runs you may check `tmp/scrape-progress.json` if the user asks. When it exits, read the tail of `tmp/scrape-run.log` (last ~80 lines) for the phase table.

### 3b: `health` only
```bash
cd /Users/jamesbarge/code/pictures && cat > scripts/.tmp-health.ts <<'EOF'
import { detectSilentBreakers, formatQuarantineReport } from "@/lib/scrape-quarantine";
import { measureHorizons, formatHorizonReport } from "@/lib/scrape-horizon";
Promise.all([detectSilentBreakers(), measureHorizons()]).then(([b, h]) => { console.log(formatQuarantineReport(b)); console.log(formatHorizonReport(h)); process.exit(0); });
EOF
npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register scripts/.tmp-health.ts; rm -f scripts/.tmp-health.ts
```

## Step 4: Horizon review (your judgement)
Read `shortHorizons` from `tmp/scrape-run-summary.json`. For each **independent** cinema under 30 days, fetch its what's-on page (`baseUrl` in `src/config/cinema-registry.ts`) and decide:
- **publishes-short**: the venue simply hasn't listed further yet. Fine; note it.
- **scraper-short**: the site lists later dates we didn't capture. Flag it with the scraper file and what's missing. Don't fix scrapers mid-run unless the user asks.

L-CUT-only venues (deptford-cinema, metroland-studios, project-loop, horse-hospital, set-social-peckham, good-shepherd-studios, the-arzner) depend on L-CUT's coverage. Note them, don't chase them.

## Step 5: Enrichment review (your judgement — the core of this command)
Read `tmp/enrichment-gaps.json`:
- `coverage`: screening-weighted %.
- `problems`: `content_type='film'` rows missing TMDB, poster or year, sorted by screening count, with `candidates` from TMDB.

Work from the top (most screenings first). For each problem, decide one of:
- **match**: a candidate is clearly the same film. Title, year and venue context all fit, e.g. repertory venues show old films, and a `year` or `directors` value from the scraper must agree. Record `"<exact title>": <tmdbId>`. Check that the tmdbId is not in `.claude/data-check-learnings.json` → `wrongTmdbMatches`.
- **reclassify**:
  - `live_broadcast` for NT Live, RBO/Met Opera, ballet, theatre-on-screen (Golden Boy, The Nutcracker, Carmen, "… – The Play").
  - `event` for quizzes, talks, workshops, parties, kids' "experiences", and festival passes or bundles.
  - `concert` for live music events (not concert *films*).
- **leave**: genuinely ambiguous, or a real film TMDB doesn't have. Don't guess. A wrong match is worse than none.
- **title fix needed**: the title carries a prefix or suffix ("… - SPECIAL PREVIEW", "2026-26: …", "Ken Russell's …"). Note the pattern for `prefixesToStrip`/`suffixesToStrip` in the learnings file. Prefer matching the underlying film when you're certain.

Write `tmp/enrichment-decisions.json`:
```json
{ "notes": "why, briefly", "match": { "<exact films.title>": 12345 }, "reclassify": { "<exact films.title>": "live_broadcast" } }
```
Then dry-run, read the plan, fix anything off, and execute:
```bash
cd /Users/jamesbarge/code/pictures && npm run enrich:apply -- --file=tmp/enrichment-decisions.json
npm run enrich:apply -- --file=tmp/enrichment-decisions.json --execute
```
- **Persist:** merge the approved entries into `data/enrichment/manual-decisions.json`. Every run re-applies that file, so rows a re-scrape recreates get fixed again:
  ```bash
  jq -s '.[0] as $a | .[1] as $b | $a | .match += ($b.match // {}) | .reclassify += ($b.reclassify // {})' data/enrichment/manual-decisions.json tmp/enrichment-decisions.json > tmp/md.json && mv tmp/md.json data/enrichment/manual-decisions.json
  ```
- **Blocklist:** if you find a film already matched to the WRONG TMDB id, add `{ "tmdbId", "title", "reason" }` to `wrongTmdbMatches` in `.claude/data-check-learnings.json` and tell the user.
- **Re-measure:** `npm run enrich:gaps -- --no-tmdb`. Newly matched films also need Letterboxd ratings: `npm run cleanup:upcoming -- --phase 4 --execute`.

Targets: TMDB ≥95% and poster ≥95% of upcoming film screenings. If you're short, say which titles are holding it back.

## Step 6: Report
```
/scrape complete — <status>   (<durationMin> min)

Phases:      ✓/⚠/✗ <label> — <detail>   (one per phase)
Screenings:  <before> → <after> (Δ)
Horizon:     <n>/<total> cinemas ≥30d; short: <cinema: publishes-short|scraper-short …>
Coverage:    TMDB a% → b% · poster … · year … · genres … · Letterboxd …
Claude review: <m> matched · <r> reclassified · <l> left · <b> blocklisted
Paid tiers:  Firecrawl <pages> pages · Browserbase <sessions> sessions
Silent breakers / yield drops: <names or none>
Next steps:  <scraper-short venues to fix, failed phases → /scrape resume, or "clean">
```

## Step 7: Obsidian run report
Write `/Users/jamesbarge/Library/Mobile Documents/com~apple~CloudDocs/Documents/Obsidian Vault/Pictures/Scrape Runs/YYYY-MM-DD.md` (London date of `startedAt`; create the folder if needed). Include the Step 6 content, a phase table, the horizon classifications and the review decisions with their reasons. If today's file exists, append `## Run 2 — HH:MM`.

## Rules
- Scrapes and enrichment write to the **production** database. That is the point of the command, but never run other destructive scripts (merges, deletes, `--execute` on anything not listed here) without the user's say-so in this session.
- Never use `npm run agents:enrich` (DeepSeek) or any hosted LLM.
- Scrapers upsert, so re-running is safe. Prefer `/scrape resume` after a failure.
- Committing changes to `data/enrichment/manual-decisions.json` or the learnings file follows the normal branch → PR flow. Merging needs "ship it".
