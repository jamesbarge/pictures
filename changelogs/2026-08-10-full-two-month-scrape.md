# Full 2-month scrape: rogue schedulers killed, 7 coverage bugs fixed, +19% screenings

**PR**: TBD
**Date**: 2026-08-10
**Branch**: `fix/superseded-cleanup-partial-batch-guard`
**Driven by**: `tasks/scrape-completeness-handoff.md` — "every cinema fully scraped for the next two months, all information complete and correct", explicitly framed as a maximisation job rather than a pass/fail gate.

## Headline

| Dimension | Pre-run | After | Note |
|---|---|---|---|
| Upcoming screenings | 6,431 | **7,649** | +1,218 (+19%) |
| Films with upcoming screenings | 1,131 | 1,233 | +102 |
| Registry entries succeeding | — | **30 / 31** | the one failure is genuinely unreachable |
| Venues at ≥50 days horizon | — | **43** | |
| Venues under 14 days | — | **1** | `electric-white-city`, at its site's limit |
| True duplicates | 0 | **0** | same venue + film + instant |
| Venues down >20% | — | **0** | on a same-instant basis |
| `(client-side)` timeouts | 31 lost writes on 2026-08-05 | **0** | |
| Circuit-breaker trips | — | **0** | |

Run shape: scrape 18.8 min, L-CUT gap-fill 1.8 min (115 inserted), cleanup 11.0 min, audit + health + delta ~0.2 min.

## 1. Two rogue cloud schedulers (the handoff's top open item)

Both were **Trigger.dev**, neither was on this Mac, and prior sessions had exhausted `crontab`, launchd, PM2, `vercel.json` and GitHub workflows looking for them.

- `scrape-all-orchestrator` — `0 3 * * *`, PRODUCTION. The 03:0x UTC writer.
- `qa-orchestrator` — `0 6 * * *`, PRODUCTION. **Previously unknown.** It writes via `src/trigger/qa/utils/db-fixer.ts` rather than `runScraper`, so it left **no `scraper_runs` row at all** — invisible to `detectSilentBreakers`, `detectStaleCinemas`, `detectFlakyCinemas` and every run-history query. It created the deprecated `nickel` cinema row on 2026-07-15 via `ensureCinemaExists`, and its `qa/utils/gemini-analyzer.ts` was making automated Gemini-driven writes to production nightly, ~2 weeks after Gemini was banned project-wide.

**Why the code deletion didn't stop them.** `@trigger.dev/sdk` *declarative* schedules (`schedules.task({ cron })`) live in the deployed bundle, and Trigger.dev stores its own `DATABASE_URL`. Removing `src/trigger/` and `trigger.config.ts` in the 2026-05-07 "remove all off-Mac automation" change deleted the source but never ran an undeploy. That also explains the "stale build" fingerprint: the bundle is frozen at deploy time, so JW3 (added 2026-06-01) never appeared and `phoenix.ts`'s long-removed `networkidle` was still present.

19 schedules (9 prod, 10 dev) deactivated with `POST /api/v1/schedules/{id}/deactivate` — which works on DECLARATIVE schedules despite the docs implying imperative-only — and verified by re-listing both environments. Original state saved for one-call restore.

⚠️ **Deactivation is not permanent: the next `trigger.dev deploy` re-creates and re-activates all 19.** Archiving the project at `cloud.trigger.dev` is the only durable fix and is still outstanding. Rotating the `TRIGGER_*` keys in `.env.local` would not help — the cloud bundle holds its own credentials.

## 2. `initFilmCache` — a run-killer nobody had measured

`SELECT * FROM films` at `src/scrapers/utils/film-matching.ts:64` returned **3,456 rows / 5.02 MB**, once per venue, inside a **15,000 ms** `withDbTimeout`.

Measured at wave concurrency 4 (the real regime; `scrape-all.ts` hardcodes 4):

| | Durations (ms) |
|---|---|
| Before | `15001/15000/15000/15000`, `8503/8228/8217/13950`, `14738/13217/15001/15001` → **6 of 12 over the ceiling** |
| After (6-column projection) | slowest call **929–3,116 ms** → **0 of 12** |

Egress per run fell **345.30 MB → 15.07 MB** (95.6%, 22.9×) — material given the project has hit the Supabase egress limit before. The 5 MB lived in `cast` jsonb, `synopsis`, `tagline` and `backdropUrl`, none of which the cache's consumers read.

Related connection facts established while measuring, both contradicting existing comments:
- `statement_timeout: 60_000` at `src/db/index.ts:50` is **not in force** — `SHOW statement_timeout` returns `2min`. Startup parameters don't survive the transaction-mode pooler, so the server grinds on abandoned queries for up to two minutes holding their connections.
- postgres.js allocates exactly `max` Connection objects up front, so the pool cannot grow and a lost slot is never replaced; `max_lifetime` does **not** rotate a mid-query connection. Queries also pipeline onto busy connections, so with `max=3` against wave concurrency 4 the fourth worker can time out from queueing alone against a healthy database.

`DB_POOL_MAX` was passed **inline** (`DB_POOL_MAX=8 npm run scrape:unified`) rather than edited into `.env.local`, since dotenv-cli never overrides an already-set key. **`.env.local` still says 3**, so the next person running `/scrape` gets the starvation precondition back.

## 3. Coverage bugs fixed

Every figure below was measured by instantiating the scraper and replaying `scrape()` with `DATABASE_URL=disabled`, so no DB write influenced the measurement.

| Venue | Rows | Horizon | Root cause |
|---|---|---|---|
| barbican | 43 → **107** | 13 → **69d** | `DAYS_AHEAD` 30 → 70 and now walks `?day=YYYY-MM-DD`, which answers a plain `fetch` — the React grid was never the obstacle |
| bertha-dochouse | 9 → **61** | 21 → **73d** | end-anchored regex dropped 34 of 122 ticketing anchors |
| phoenix-east-finchley | 8 → **66** | 7 → 25d | only the first `.perf-time` per date was read; now 66/66 of the site's future performances |
| peckhamplex | 114 → 113 | **4 → 57d** | `/films/coming-soon` was never fetched. 4 of its 7 entries carry real dated showtimes; the other 3 have no `.book-tickets` element at all and correctly emit nothing |
| everyman (×16) | 1214 → 1225 | +24d | `SCHEDULE_WINDOW_DAYS` 45 → 70. Low row gain, but it stops the day-45 wall clipping NT Live / Met Opera advance sales |
| bfi-imax | 10 → **113** | 32d | no scraper change — the health-check precheck was aborting it every run |
| curzon (×10) | — | see §4 | — |
| close-up-cinema | 0 → **0** | — | new Cloudflare Turnstile; **no gain claimed**. `healthCheck()` now fails in 0.2s/1 request instead of 16.4s/3 |

Correctly identified as **not** defects, at their sites' published limits: `electric-portobello`, `electric-white-city`, `coldharbour-blue`, `jw3`.

## 4. Curzon's horizon cap was inverted

`dates.slice(0, 30)` capped the number of **published business dates**. Vista returns only dates with something programmed, so the horizon varied *inversely* with how busy a venue is: a venue screening something nearly every day spent 30 entries in ~30 days, while one whose list is mostly sparse advance-sale opera dates spread 30 entries across a year.

- `curzon-bloomsbury`: 58 published dates, we stopped at the 30th = day 38, **dropping 12 screenings inside the next 60 days** (DocHouse strands, NT Live, Met Opera).
- `curzon-mayfair`: 38 sparser dates → reached day 167.
- The busiest venue got the shortest horizon.

Replaced with a 70-day calendar cutoff (`dates.filter(d => d <= cutoff)`), self-bounding at `HORIZON_DAYS + 1` requests per venue. Bloomsbury 159 → **315** rows and 29 → **39** dates; Soho gained the single date it was short; Aldgate unchanged, since it publishes only 20 dates and was already taking everything. Chain re-scrape: **10/10 venues, +901 added / 805 updated**, 0 failed.

⚠️ Trade-off: rows beyond 70 days are no longer refreshed, so a far-future one-off persists from its last scrape and won't be removed if cancelled. Pre-existing rows past the cutoff were left in place — they're valid published screenings, and `.claude/rules/database.md` forbids deleting valid future ones.

## 5. Pipeline hardening (handoff §4a–4d) and review follow-ups

- **4a** — a diff timeout no longer discards a completed scrape, and no longer fails the 10 sibling venues sharing a chain's try block. Because a fail-open diff loses the `shouldBlockScrape` sanity check, `skipSupersededCleanup: true` is forced when the diff fails, so the DELETE cannot run unchecked.
- **4b** — lost writes record as **`partial`** (an existing `scraperRunStatusEnum` value, so no migration) with `metadata.failureKind` classified from the error string: `(client-side)` → `db-timeout`, `Health check failed` → `precheck`, else `scrape`. There were **0 `partial` rows in the prior 90 days** (5,181 success / 290 failed), so this run wrote the first. Also closes a real data-loss path: `reconcile-phantom-screenings.ts:216` authorises deletes off the last `status='success'` run under 2h old, which a lost-writes run used to satisfy.
- **4c** — the precheck is advisory rather than an abort, with `fetchUrl`-matching headers and timeout, and runs **once per venue** instead of once per retry attempt (which would otherwise have burned ~400s and risked tripping the breaker via the 600s wall-clock cap).
- **4d** — `detectFlakyCinemas` gained `maxAgeDays: 30`, filtered **inside** the CTE so `ROW_NUMBER()` ranks only in-window rows. Proven by execution: 5 cinemas at 30 days, 0 at 1 day, and `cinema-museum` — 43% flaky on three failures fixed in June — drops off.
- Review follow-ups applied: `partial` now reports in the Telegram digest (it matched none of the three `if/else` branches and would have read as clean); a `(client-side)` failure arriving via `venueResults[].error` rather than `diffFailed` now reaches the circuit breaker; Phoenix's sold-out showtimes no longer inherit the *next* showing's booking URL; Barbican's day-walk aborts on the first hard failure instead of fetching 69 more pages it will discard, and reads full instance text rather than `.find("span").first()`.
- `warmConnectionPool()` runs before wave 1. Across 108 samples a session's first `initFilmCache` wave ran 9,870–12,368 ms and once expired on all four slots at once, while every wave after the pooler warmed ran 349–3,791 ms — independent of host load. Four `select 1` handshakes cost ~0.7s.

## 6. Four new venues from L-CUT

A 56-day census of the L-CUT API returns exactly **20 distinct venues** (the venue field is `cinema`, not `venue`; `hasMore` drives pagination). 16 were mapped. Added as gap-fill-only, matching the `the-arzner` pattern: `deptford-cinema`, `ibraaz`, `metroland-studios`, `set-social-peckham`. We now map all 20.

Deptford Cinema has **no fixed address** — the collective left its Deptford Broadway shopfront in 2020 and runs as a monthly pop-up residency, so its registry address will go stale.

Also corrected: `src/db/seed-cli.ts` **does** now read the registry via `getCinemasSeedData`, so a new cinema needs the registry only (plus `VENUE_MAP` when L-CUT is its source). The prior "add it in both places" note is obsolete.

## 7. Tooling

`tsconfig.json` now excludes `tmp`. Agent scratch files under `tmp/agent/` were producing **55 phantom `tsc` errors** (duplicate top-level consts across sibling scripts), which masked the real result and made the `npx tsc --noEmit` gate that CLAUDE.md requires useless. Now 0 errors.

## Impact

- **Users**: ~1,200 more screenings visible, and materially longer horizons at Barbican (13→69d), Bertha DocHouse (21→73d), Peckhamplex (4→57d) and Curzon Bloomsbury (38→68d). Four new venues once gap-fill runs for them.
- **Data integrity**: production is no longer being written by two unattended orchestrators running ~2026-04 code, one of which was invisible to every detector and one of which used a banned hosted LLM to make automated fixes.
- **Operability**: run outcomes are now honestly recorded (`partial` + `failureKind`), the flaky detector no longer grades months-old failures, and per-run egress dropped ~330 MB.

## Known-open, deliberately not fixed here

- `everyman-walthamstow` sits at 0 while every sibling has 20–160. Unexplained.
- `nickel` holds 46 rows that are 100% duplicate `source_id`s of `the-nickel`, contributing nothing unique. Needs a gated cleanup — and only after tomorrow's 06:00 UTC confirms the writer is dead, or they simply return.
- `close-up-cinema` is unreachable behind Cloudflare. L-CUT holds ~53 of its listings, so whether the source-only gap-fill can backfill a venue whose *scraper failed* is the open question.
- 100 screenings remain in 00:00–09:59 London. ~97 are **genuine** Everyman/Picturehouse 09:00–09:55 school-holiday kids shows arriving as `timeSource: "iso"` (no meridiem in that path at all). The handoff's "this should hit zero" target was wrong; the floor is ~97.
- `"Met Opera 2026-27: Macbeth"` stores as `"2026-27: Macbeth"` — `findEventPrefix` strips the prefix and leaves the dangling season number.
- `date-parser.ts:192` coerces a zero-padded 24-hour `09:30` to **21:30**. Latent, not observed live, and left alone rather than changed under 30+ scrapers on run night.
- `partial` rows drop out of `detectYieldDrop` / `detectYieldDeltaSinceBaseline`, which filter `status = 'success'`.
- **Do not run the weekly scrape on a Sunday.** Release-driven chains publish each Friday→Thursday week early in the preceding week; Sunday's run captured 1–2 advance showtimes for 08-14..08-20 where a Monday replay returned 16/day (99 missing at Aldgate alone, with zero ghost rows — nothing was lost, the data did not yet exist).

## Verification status — honest

- Invariants: measured and reported above.
- Unit tests: **110 passing** across the 10 affected suites; `tsc --noEmit` and `eslint` clean. Full suite not run locally (documented vitest wedge) — CI is the gate.
- **Live-site verification is partial.** A 24-agent pass lost 32 of 35 agents to an environment failure. The 3 survivors covered 6 Curzon venues: accuracy was exact (70/70, 45/45 and 39/39 matched on film and minute, including a 23-shows-a-day grid), and they surfaced the horizon-cap bug in §4. **The remaining ~66 venues are not live-verified.**
