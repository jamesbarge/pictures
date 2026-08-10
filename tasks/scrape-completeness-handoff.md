# Handoff: full 2-month coverage for every cinema

> ## ⚠️ LARGELY EXECUTED 2026-08-10 — read this box before the rest of the file
>
> A run was completed against this handoff. Full detail in
> `changelogs/2026-08-10-full-two-month-scrape.md`. **Result: 6,431 → 7,649 upcoming
> screenings (+19%), 30/31 registry entries succeeding, 0 true duplicates, 0 venues
> regressed, 43 venues at ≥50 days horizon, and zero `(client-side)` timeouts.**
>
> **CLOSED**, do not redo:
> - **§1a (rogue nightly host)** — SOLVED. It was **two** still-live **Trigger.dev**
>   schedules: `scrape-all-orchestrator` (`0 3 * * *`) and, previously unknown,
>   `qa-orchestrator` (`0 6 * * *`), which wrote via `db-fixer.ts` and so left **no
>   `scraper_runs` row at all**. All 19 schedules deactivated and verified.
>   ⚠️ **Any future `trigger.dev deploy` revives them** — archiving the project is
>   James's outstanding action.
> - **§1b (`DB_POOL_MAX`)** — worked around by passing it **inline**
>   (`DB_POOL_MAX=8 npm run scrape:unified`); dotenv never overrides a preset key.
>   **`.env.local` still says 3**, so the next runner gets the starvation precondition
>   back unless James raises it.
> - **§4a, §4b, §4c, §4d** — all fixed, plus six review follow-ups.
> - **§4e (four thin venues)** — NOT a `runScrapeAll` defect. They were simply absent
>   from the ghost's frozen registry, so they only ran when James ran `/scrape` by hand.
> - **§3 (horizons)** — barbican 13→69d, bertha-dochouse 21→73d, peckhamplex 4→57d,
>   everyman 45→70d window, curzon rewritten (see below), phoenix 8→66 rows.
>
> **CORRECTIONS to this document — it is wrong in three places:**
> 1. **§0's "zero screenings 00:00–09:59" target is wrong.** Of the 123, ~120 were
>    **genuine** Everyman/Picturehouse 09:00–09:55 school-holiday kids shows arriving as
>    `timeSource: "iso"` — there is no meridiem in that code path at all, so a 12-hour
>    flip is impossible. Only 3 were defects (david-lean 00:00 orphans from the ghost's
>    pre-#671 code). **Genuine HEAD parse bugs: zero.** The floor is ~97, not 0.
> 2. **§5's "Close-Up is a healthy scraper, header shape is irrelevant" is now false.**
>    It gained a Cloudflare **Turnstile** after 2026-08-05: plain fetch returns 403 with
>    `cf-mitigated: challenge`. Its scraper is fine; the venue is unreachable. L-CUT holds
>    ~53 of its listings, so gap-fill is the likely rescue. **Never a paid proxy.**
> 3. **§8's advice to add new cinemas in two places is obsolete.** `src/db/seed-cli.ts`
>    now reads the registry via `getCinemasSeedData`; the registry alone is enough.
>
> **NEW findings not in this document:**
> - **Do not run the weekly scrape on a Sunday.** Release-driven chains publish each
>   Friday→Thursday week early in the preceding week. Sunday's run captured 1–2 advance
>   showtimes for 08-14..08-20; a Monday replay returned 16/day — 99 missing at Aldgate
>   alone, with **zero ghost rows**, so nothing was lost, the data did not yet exist.
>   Mid-week (Wed–Thu) is worth more coverage than several scraper fixes.
> - **`initFilmCache` was the real 2026-08-05 killer**, not just the pool: `SELECT *
>   FROM films` (5.02 MB) once per venue against a 15s ceiling took 28.5–35.3s at wave
>   concurrency 4. Narrowed to 6 columns → fits, and run egress fell 345 MB → 15 MB.
> - **Curzon's `dates.slice(0, 30)` capped *dates*, not days**, so the busiest venue got
>   the shortest horizon (Bloomsbury stopped at day 38 while sparse Mayfair reached 167).
>   Now a 70-day calendar cutoff; chain re-scrape +901 added / 805 updated.
> - `tsconfig.json` now excludes `tmp` — scratch files were making `tsc --noEmit` report
>   55 phantom errors, so that gate had been silently useless.
>
> **STILL OPEN** (see the changelog's final section for the full list):
> `everyman-walthamstow` at 0 and unexplained · `nickel`'s 46 duplicate rows awaiting a
> gated cleanup · Close-Up unreachable · `"Met Opera 2026-27: Macbeth"` → `"2026-27:
> Macbeth"` · `date-parser.ts:192` coercing zero-padded `09:30` to 21:30 · `partial` rows
> invisible to the yield detectors · **live-site verification covered only 6 of 72
> venues** — a 24-agent pass lost 32 of 35 agents to an environment failure, so ~66
> venues are NOT live-verified. That is the single biggest gap remaining.

**Written**: 2026-08-06 by the session that ran (and killed) the 2026-08-05 `/scrape`.
**Goal from James**: every cinema fully scraped for the next two months, all information complete and correct.

Read this whole file before running anything. The first two sections change what you should do first.

---

## 0. The standard

James's clarification, verbatim: *"it doesn't need to be exactly two months, or fully verified 100% correct, but we need to get as close as possible."*

So this is a maximisation job, not a pass/fail gate. Push coverage and accuracy as far as they will go, measure where you landed, and report the numbers honestly. Do not stall on a venue that cannot reach 60 days, and do not claim a completeness you did not measure.

Two limits that cap what is achievable, so you can recognise them rather than fight them:

1. **We cannot scrape what a venue has not published.** Most London independents publish 2 to 4 weeks ahead, not 8. A venue showing 18 days of listings is *done* if that is all it has listed. Chasing 60 days there is wasted effort and extra load on a site.
2. **Correctness can only be sampled.** You can check invariants across the whole set cheaply, and spot-check individual venues against their own sites. Exhaustive proof would mean re-scraping every site by hand.

Measure and report these. Treat them as dials to push, not thresholds to pass:

| Dimension | Push toward | How to measure |
|---|---|---|
| Venue coverage | All 71 active cinemas in `src/config/cinema-registry.ts` scraped successfully | `detectSilentBreakers()` + `detectStaleCinemas()` |
| Horizon | Each venue at its own published limit, up to ~56 days | Per-venue max(datetime), compared against the venue's site where it looks short |
| Row counts | No unexplained drop vs the previous run | Per-venue counts, run over run |
| Time sanity | Zero screenings 00:00 to 09:59 London | SQL; see `.claude/rules/scrapers.md`. This one really should hit zero, it is always a parsing bug |
| Film identity | No wrong TMDB matches, no dirty titles | `npm run audit:fix-upcoming` (dry) |
| Sampled accuracy | As many venues spot-checked against live sites as time allows | Record which venues you checked, so the next agent does not repeat them |

Optional fields (`screen`, `format`, `season`, `eventType`, `hasSubtitles`, `subtitleLanguage`, `hasAudioDescription`, `isRelaxedScreening`) are mostly unpublished by venues and will never approach 100%. Report their coverage as a percentage; do not treat absence as a defect.

**The highest-leverage work is not the scrape itself.** It is fixing the things in sections 1 and 4 that either lose data silently or make you unable to tell whether the run worked. A clean run on a broken measurement layer tells you nothing.

---

## 1. Blockers. Do these before any scrape run

### 1a. An unidentified host is writing to production nightly, running ~2.5-month-old code

This is the single most important open item. Until it is found, **you are measuring two codebases at once** and any fix you ship may not be what actually executes at 03:0x.

Evidence (three independent signals, verified this session):
- A `phoenix` failure row in run history contains `waiting until "networkidle"`. `src/scrapers/cinemas/phoenix.ts:44-45` explicitly documents *not* using networkidle, and a verified HEAD run emitted zero occurrences of it.
- `JW3` was added 2026-06-01 (PR #641) and is `active: true`, but has never run in the 02:00 to 05:00Z window.
- `bfi_import_runs.triggered_by` holds `trigger.dev:bfi-changes`, a string absent from HEAD, from a service the April/May changelogs say was removed.

Already searched and came up empty: `crontab -l`, launchd agents referencing the repo, `~/.pm2/dump.pm2` (empty), `crons` in `vercel.json`, `schedule:` in any GitHub workflow, `trigger.config.ts`.

Still worth trying: Trigger.dev's own dashboard (the `trigger.dev:` prefix is the strongest clue), any other machine or VPS with a checkout, a Supabase scheduled function / pg_cron job, a Railway/Render/Fly service, and Vercel project settings outside `vercel.json`. Ask James: this likely needs his memory of what was set up, not more grepping.

Related: `.claude/rules/database.md` and the stored note previously said "no scheduler by policy". That is now marked contradicted. Also very likely the same mechanism behind the `bfi-changes-%` orphan rows previously written off as a one-off stale checkout.

### 1b. `DB_POOL_MAX=3` against wave concurrency 4

`.env.local` sets `DB_POOL_MAX=3`. `src/lib/jobs/scrape-all.ts:15` caps each wave at concurrency 4. So four venue pipelines contend for three connections.

Worse, `withDbTimeout` (`src/db/index.ts:89-104`) abandons the promise while postgres.js keeps the socket, so **each timeout costs a pool slot until `max_lifetime` (30 min) rotates it**. Three expiries starve the pool and everything after fails `(client-side)`. That is exactly the cascade that killed the 2026-08-05 run.

Fix: raise `DB_POOL_MAX` to at least 6 in `.env.local`. **This is James's config file, so ask before editing it.** Also note the JSDoc at `src/db/index.ts:84-88` still reasons from `max: 1` and is stale.

### 1c. Do not run on a busy machine

Every failure on 2026-08-05 was a `(client-side)` timeout, meaning a Node timer fired, not Postgres rejecting anything. The host was at load 10.58 on 10 cores with Spotlight reindexing (`mds_stores`, `mdworker_shared`) and three iCloud daemons (`bird`, `cloudd`, `fileproviderd`) competing.

Check `uptime` before starting. If the 1-minute load average is above roughly 4 on this 10-core machine, wait. The run takes 30 to 60 minutes of mostly-idle waiting, so it is cheap to start it when the machine is quiet.

---

## 2. Current state

- **PR #742** is open, mergeable, CI green (`Unit & Integration Tests` pass, 12 new tests). Branch `fix/superseded-cleanup-partial-batch-guard`. It stops `cleanupSupersededScreenings` deleting valid screenings when a venue's writes partly failed. **Merging it is a prerequisite for trusting any run that has write failures.** Not merged: needs James's explicit approval.
- **Checkpoint**: `tmp/scrape-checkpoint.json` from `runId 2026-08-05T20:11:53`, `completedPhases: []`, six completed scrape entries (`chain-everyman`, `chain-curzon`, `coldharbour-blue`, `regent-street`, `cinema-museum`, `jw3`). **It expires 24h after 20:11 on 2026-08-05**, so by the time you read this it has almost certainly lapsed and `/scrape resume` will fall back to a full run. That is fine.
- **`tmp/scrape-run-summary.json` is stale** (2026-07-18). The 2026-08-05 run died before its fatal handler, so it wrote no summary and `tmp/scrape-runs/` has no file for it.

---

## 3. The two-month horizon problem

Some scrapers structurally cannot return 60 days, regardless of run health. Verified constants:

| Scraper | Constant | Window | Covers 56+ days? |
|---|---|---|---|
| `cinemas/barbican.ts:27` | `DAYS_AHEAD = 30` | 30 days | **No** |
| `chains/everyman.ts:376` | `SCHEDULE_WINDOW_DAYS = 45` | 45 days | **No** |
| `cinemas/bfi.ts:82` | `SEARCH_WINDOW_DAYS = 70` | 70 days | Yes |
| `cinemas/jw3.ts:31` | `WINDOW_DAYS = 120` | 120 days | Yes |

Every other scraper takes whatever its site publishes with no declared cap.

**Before changing these**, check whether the venue actually publishes further out. Raising Barbican to 60 is pointless if Barbican only lists 4 weeks, and it costs request volume against a site we already have trouble with. The right sequence is: query current max(datetime) per venue, compare against the venue's site, and only then raise the constant where the site genuinely has more.

Given "as close as possible" rather than a hard 60, this is low priority. A venue capped at 45 days when it publishes 45 days is not a problem. Only chase it where the site demonstrably has more than we are taking.

Barbican specifically is a known-hard target (React grid, mentioned in CLAUDE.md as a candidate for vision-mode). Treat it with care.

---

## 4. Known bugs, in priority order

These were diagnosed this session but **not fixed**. Each has been verified against source. None is in PR #742.

### 4a. A diff timeout throws away a completed scrape (highest data-loss impact)

`generateScrapeDiff` failing makes `processScreenings` throw, so `runSingleVenue` retries the **entire venue including the scrape**. On 2026-08-05, Phoenix logged `Found 16 films` and discarded all 16, three times. Because `processScreenings` sits inside the chain loop's try (`runner-factory.ts:757`, try at `:710`), one venue's timeout also failed **all 11 Picturehouse venues** with that venue's error message.

The diff is a guard, not a data dependency. It should fail open, or a diff timeout should be treated as `blocked: true` rather than a throw. Proposed patch exists in the session notes; re-derive it rather than trusting a paste.

### 4b. Lost screenings are recorded as `success`

`runner-factory.ts:508-514` records `status: "success"` regardless of `result.failed`. A venue that lost 17 screenings is written to `scraper_runs` as a success. Meanwhile a health-check precheck abort is recorded as `failed`.

That asymmetry is why pre-flight blamed six innocent scrapers while the run's actual 31 dropped writes left no failed-run trace. **This is the bug that most damages your ability to verify completeness**, because your primary signal lies in both directions. Fix it before trusting flakiness stats.

Suggested: add `failureKind: "precheck" | "db-timeout" | "scrape"` to the existing `metadata` jsonb on `scraper_runs` (no migration needed) and classify from the error string. `(client-side)` uniquely marks a `withDbTimeout` expiry; `Health check failed` uniquely marks the precheck gate.

### 4c. The health-check gate causes false negatives at scale

`src/scrapers/base.ts:249` caps the precheck at `AbortSignal.timeout(10_000)` and sends UA-only headers, while the real work in `fetchUrl` (`base.ts:131`) gets `30_000` and full browser headers. **The gate is both stricter and less browser-like than the work it gates.** A failed precheck aborts the whole scrape at `runner-factory.ts:421-425`.

Measured for Close-Up on 2026-08-05: homepage returns 200 in 1.9 to 6.5s sequentially, 7.4 to 8.8s at 5-way concurrency, and breaches 10s on a second concurrent burst. The nightly runs 4 scrapers at once, which is that regime. Header shape is **not** a factor: UA-only, full headers, and *no User-Agent at all* all returned 200 with no `cf-mitigated`.

Six cinemas carry `healthCheck()` overrides that exist only to defeat this gate. When six of 31 entries need a workaround for one guard, the guard is the defect. The real fix is demoting it from `throw` to a logged warning and letting each scraper's own error surface.

### 4d. The flaky detector has no age bound

`detectFlakyCinemas` in `src/lib/scrape-quarantine.ts` takes the most recent `lookback: 10` runs with no time bound. For a low-volume cinema the window is its entire history, so fixed failures can never age out. Cinema Museum shows 43% flaky on three failures from 2026-06-08 to 06-11 that were fixed on 06-12 by PR #671, out of only 7 lifetime runs.

Fix: add `maxAgeDays: 30` to `FlakyThresholds` and filter inside the CTE so `ROW_NUMBER()` ranks only in-window rows.

### 4e. Smaller items

- The husky pre-commit hook is not executable, so git silently ignores it. Whatever gate it encodes has not been running.
- `src/scrapers/run-close-up-v2.ts:11` hardcodes the deprecated venue id `"close-up"`, deleted in the May 2026 cleanup. Running it would call `ensureCinemaExists` and resurrect the row.
- Dead but inert: `src/scrapers/cinemas/rich-mix.ts` (v1, zero references; the registry correctly imports `rich-mix-v2`), and `chiswick 2.ts` / `chiswick.test 2.ts` (Finder-style duplicates with spaces in the name). The registry uses 32 explicit imports rather than globbing, so nothing unreferenced is silently loaded. Per CLAUDE.md, do not delete pre-existing dead code unless asked.
- Title extraction decapitates titles where an event prefix is grammatically part of the sentence. `"UK Premiere of Jimmy Somerville - Queer Rebel of English Pop"` is stored as `"of Jimmy Somerville - Queer Rebel of English Pop"`. `findEventPrefix` in `src/lib/title-extraction/patterns.ts:39` strips `"UK PREMIERE"` without requiring a `:` or `-` delimiter.
- Four venues (`cinema-museum`, `jw3`, `chiswick-cinema`, `bertha-dochouse`) run roughly 3 times per 30 days versus ~32 for peer venues. Root cause undetermined. Both entry points call the same `runScrapeAll` over the full registry with no per-wave cap or freshness skip, so this may be another symptom of 1a.

---

## 5. The six cinemas pre-flight will flag. Four are not broken

Do not start by reading these scrapers. Pre-flight's verdicts are unreliable because of 4b and 4d.

| Cinema | Pre-flight | Actual, verified this session |
|---|---|---|
| Cinema Museum | 43% flaky | **Healthy.** Detector artefact (4d). Live check: 21 screenings parsing correctly, BST correct, none before 10:00. Site publishes to 2026-10-21. |
| Close-Up | 40% flaky | **Healthy scraper.** Health-check timeout (4c), not a WAF 403. 53 upcoming screenings, clean time distribution. |
| BFI IMAX | 90% flaky | Precheck abort (4c). One shared bug with Southbank. |
| BFI Southbank | 80% flaky | **Same bug, same registry entry** (`scraper-bfi` is one `multi` entry running both venues through `createBFIScraper`). Fix once, fixes both. |
| Phoenix | 100%, "never succeeded" | **Healthy scraper.** Logged `Found 16 films`, died at the DB step (4a). |
| Rich Mix | 100%, "never succeeded" | **Healthy scraper**, registry correctly wired to v2. Worst-hit victim of the pool starvation (17 terminal write failures). |

BFI's scraper is genuinely well built: one page load, a wide date-range search with `page_size=2000` so pagination never happens, then bracket-matching the inline `searchResults` array. Do not "fix" it into per-date searches, which re-trigger the Cloudflare challenge.

---

## 6. Running it

```bash
uptime                                    # 1-min load should be < ~4 before starting
cd /Users/jamesbarge/Documents/code/filmcal2
npm run scrape:unified                    # full run, 30-60 min
```

Do not background it if you want to watch, but note the Bash tool caps at 10 minutes, so in practice you must run it detached and follow `tmp/scrape-progress.json` or tail the output file. Every phase heartbeats into that file; `/scrape status` from another session reads it.

If it fails partway: `npm run scrape:unified -- --resume` (same args, within 24h, else it silently becomes a full run).

**Watch for the failure signature from 2026-08-05:**
```
Connection timeout on insertScreening: <venue>/<sourceId> — deferred for end-of-venue retry
Deferred write failed on retry (final this run): ...
<venue> > diff threw after 15002ms: generateScrapeDiff: cinema lookup (<venue>) timeout after 15000ms (client-side)
```
If those appear, **kill the run**. It will not recover; the pool is starved and it will sit retrying (last time, for 11 hours with no watchdog). Fix the pool first.

---

## 7. Verifying, in the order that catches the most

1. **Read `tmp/scrape-run-summary.json`**, not hand-rolled DB queries. Check `finishedAt` matches the run you just watched; a stale timestamp means it crashed before the fatal handler.
2. **Silent breakers and stale cinemas**: `detectSilentBreakers()` and `detectStaleCinemas()` should both be empty. Note a silent breaker needs 2 consecutive `success && count=0` runs, so one clean run does not clear a flag.
3. **Time sanity**: 0 upcoming screenings between 00:00 and 09:59 London. Any hit is a parsing bug, per `.claude/rules/scrapers.md`. Also check AM/PM handling: an hour of 1-9 with no meridiem should be assumed PM.
4. **Horizon per venue**: max(datetime) per cinema. Anything under 14 days out deserves a look at the venue's site. Barbican and Everyman will cap at 30 and 45 by construction (section 3).
5. **Row counts per venue** against the previous run. A large drop with a `success` status is the 4b signature.
6. **Film identity**: `npm run audit:fix-upcoming` (default dry) for wrong TMDB matches, dirty titles, non-films. Review the dry output before `--execute`. There is a known-unsafe entry class here, see the memory note on the 101 unverified poster rows.
7. **Sample against live sites.** This is the only real correctness check. Pick 20+ venues, fetch the venue's own listings page, compare a few films and times each. Record which venues you checked so the next agent does not redo the same ones.

For UI-facing verification, `.claude/rules/frontend.md` requires Playwright at mobile and desktop viewports; that applies if you touch anything the site renders.

---

## 8. Traps that cost this session hours

- **`(client-side)` is the discriminator.** A message ending `(client-side)` is a `withDbTimeout` expiry from `src/db/index.ts:97`, meaning infrastructure. `Health check failed - site not accessible` is the precheck gate at `runner-factory.ts:424`, meaning the scrape never ran. Group failures by that substring **before** reading any scraper. I skipped this and produced six wrong hypotheses in a row.
- **Never `npx tsx -e '...'`.** zsh history-expands `!` inside single quotes. Write a script file into the scratchpad.
- **Never `waitUntil: "networkidle"`** in scrapers. Analytics connections keep sockets open so it never fires and every `goto` times out, looking like an outage. Use `domcontentloaded`. Note `src/scrapers/utils/browser.ts:299` still uses it in `fetchWithBrowser`.
- **Local `vitest`, `tsc` and `eslint` may not complete on this machine.** The vitest worker pool times out after 60s on both `forks` and `threads`, and pre-existing test files fail identically, so it is not your code. **Push a branch and let CI run them**; CI did the full suite in 3m9s on the same commit that wedged locally. To execute a single pure function without vitest: `DATABASE_URL=disabled npx tsx -r tsconfig-paths/register <script>`, which makes `src/db/index.ts` build the `max: 0` placeholder client so no query can reach Postgres.
- **`E2E Tests` reporting "pass in 6s" is a false pass.** That job self-skips without `DATABASE_URL_TEST`. `Unit & Integration Tests` (~3m) is the real gate. `verify` also reports SKIPPED. Three checks on this repo report non-failure without running anything.
- **Background subagents must be told to `SendMessage` to `main`.** Their plain text output never reaches the spawner. Six agents finished and delivered nothing until pinged the next morning.
- **Do not let agents query the DB during a write-heavy run.** Even if the evidence says they were not the cause, it is needless contention on the thing you are trying to measure.
- **Git push stalls on HTTP/2**; use `git -c http.version=HTTP/1.1 push`.

---

## 9. Suggested order of work

1. Ask James about 1a (the rogue host) and 1b (`DB_POOL_MAX`). Both need his decision. Do not edit `.env.local` unasked.
2. Get PR #742 merged, so a run with write failures cannot delete valid screenings.
3. Fix 4b (run status accounting), because until it is fixed you cannot measure whether anything else worked.
4. Fix 4a (diff fail-open), the largest data-loss path.
5. Run `/scrape` on a quiet machine. Verify per section 7.
6. Only then look at horizons (section 3) and the remaining scraper-level items.
7. Report against the table in section 0, with the sampled-venue list attached. Give the measured numbers and name what you did not check. "58 of 71 venues verified clean, 9 short-horizon because their sites are, 4 unresolved" is a good report. "100% complete and correct" is not, and would be unverifiable.

If you run out of time or hit the 3-attempt limit on something, stop and hand back with what you measured. Partial coverage that is honestly described is worth more than a full run nobody can trust.

---

## 10. Things not to do

- Do not add a paid proxy (ScraperAPI or similar) for BFI or any Cloudflare-fronted site. Explicitly banned. Use the stealth helpers in `src/scrapers/utils/browser.ts` (`createPersistentPage`, `waitForCloudflare`).
- Do not use Gemini or any hosted LLM for analysis. Banned project-wide as of 2026-07-26. `GEMINI_API_KEY` and `src/lib/gemini.ts` are dead by intent.
- Do not commit to `main`. Feature branches, conventional commits, both changelog locations updated (`RECENT_CHANGES.md` and `changelogs/YYYY-MM-DD-*.md`).
- Do not merge, deploy, or push to prod without James's explicit keyword approval ("ship it", "deploy", "push to prod").
- Do not delete screenings to "clean up" a discrepancy. Scrapers add and update; the only sanctioned deletions are confirmed parse errors, true duplicates, and orphans.
- Do not trust the flaky report as a list of broken scrapers. See section 5.
