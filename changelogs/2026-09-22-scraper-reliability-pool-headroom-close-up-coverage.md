# Scraper reliability: pool headroom, Close-Up coverage, Rich Mix deactivation

**PR**: #754
**Date**: 2026-09-22

## Why

The 2026-09-20 weekly `/scrape` recorded **5 ok / 26 failed**. Investigating that one
run surfaced four independent defects, three of which had been silently costing
coverage for weeks.

## 1. Pool starvation skipped 25 of 31 venues

`DB_POOL_MAX` was **3** while both scrape waves ran at concurrency **4**. postgres-js
allocates exactly `max` Connection objects up front, so the fourth venue in each wave
queued on connection acquisition.

Measured 2026-09-20: `electric`, `rich-mix`, `phoenix` and `regent-street` each blocked
**852s** against the **600s** per-venue wall-clock cap, to the millisecond together.
The scrapers were healthy — `[electric] Fetching from API` and `Found 17 valid screenings`
appear in the log *after* its timeout fired.

The cascade, all working as designed:

1. Four venues exceed the 600s cap.
2. `isConnectionError` matches `"wall-clock cap"` (`runner-factory.ts`), so a cap expiry
   counts as a connection failure.
3. Three consecutive trips the run-level circuit breaker.
4. `CIRCUIT BREAKER TRIPPED … Skipping remaining scrapers` — the remaining **18 Cheerio
   venues were never attempted**, recorded as rejected with `circuit breaker tripped`
   and zero HTTP requests made.

The breaker is correct and unchanged; its own comment cites the 2026-06-09 13.7h stall
as its reason for existing, and it converted a potential multi-hour hang into a
21-minute failure. The defect was a pool sized below the concurrency drawing on it.

This was **predicted**: `changelogs/2026-08-10-full-two-month-scrape.md:54` records that
`DB_POOL_MAX=8` was passed inline rather than written to `.env.local`, leaving "the next
person running `/scrape`" with the starvation precondition.

**Fixed**: `.env.local` now sets `DB_POOL_MAX=8`. Per `src/db/index.ts`, the pool must be
sized *with headroom above* wave concurrency, since a wedged conn holds its slot for
minutes and "three such expiries against `max: 3` is what cascaded on 2026-08-05" — so 4
would have left none. `scrape-all.ts` gains a single `WAVE_CONCURRENCY` constant (the two
call sites previously repeated `4` as a literal with nothing tying it to the pool) and a
startup warning naming this failure when the pool lacks headroom.

**Verified** by resuming the same run with the fix: **30 ok / 1 failed**, +844 screenings,
stale cinemas 29 → 7. `electric` 852s → **6.4s**, `rich-mix` 852s → 8.9s, `regent-street`
852s → 15.1s.

## 2. Close-Up: intermittent Cloudflare challenge, retried into rather than waited out

Close-Up had **no successful run in 42 days**. The header comment claimed a day-scale
protection toggle. It is a Cloudflare managed challenge cycling in **~19-27 minute
IP-scoped windows**.

Measured live 2026-09-20/21 UTC: 403 at 16:17 (the nightly run), 200 at 16:36-16:39 (a
full 11-page scrape), 403 on **57 consecutive polls** 16:41-16:59, 200 from 17:00; and the
next morning 53 consecutive 403s from 09:33 clearing at 10:00:23.

Nothing about the request moves it, re-measured during a live block: current headers,
Chrome 131 UA, Chrome 120/131 plus `Sec-CH-UA*` / `Sec-Fetch-*` /
`Upgrade-Insecure-Requests`, Googlebot UA and no headers at all all returned 403 inside
the same minute. Stealth Playwright (`createPersistentPage` + `waitForCloudflare`) sat on
"Just a moment..." for 60s headless and headed. TicketSource returns the same challenge.
This supersedes the "richer headers for Close-Up's healthCheck()" remedy in older notes;
that override was already removed on 2026-08-09.

Compounding it: `runSingleVenue` re-attempts a failed venue 4 times on one instance, each
re-running `fetchWithRetry`'s 3 tries — **13 requests over ~79s** into a live mitigation.
That is the fingerprint behind the 78.5-79.6s duration on every blocked run in
`scraper_runs` (09-08, 09-09, 09-20). None could have succeeded; the block outlasts that
budget roughly 15×.

**Fixed**: an `isChallenge()` + `challengeSeen` latch fast-fails on the first 403 and makes
the runner's remaining attempts return without touching the network. Measured against a
live block: attempt 1 fails in 2400ms with one request, attempts 2-4 in 2ms/0ms/1ms with
no network. **79s and 13 requests → 2.4s and 1 request.**

## 3. Deferred challenge retry (new phase)

The fast-fail stops the waste but does not recover the venue. A challenge is the one
failure class where the identical request succeeds later untouched, so `scrape-all.ts`
now queues challenged venues and re-attempts them **once, 20 minutes after the block**,
before enrichment (so anything recovered still gets its Letterboxd pass).

- New `SCRAPER_CHALLENGE_MARKER` in `src/scrapers/types.ts` (leaf module, so a scraper can
  throw it without importing the pipeline and db that `runner-factory` pulls in), read by
  `isChallengeError()`.
- Deliberately **not** matched by `isConnectionError`: a venue's WAF must not trip the run
  circuit breaker, which exists for wedged DB connections.
- 20 minutes is past the shorter measured block and most of the longer one. The wait is
  measured from the failure, not the end of the run, so a venue blocked early has usually
  already served it. Capped at 8 minutes of actual sleeping.
- One attempt only: if a block outlasts that, the next scheduled run picks it up.

A retry on this schedule would have collected Close-Up on all three recorded failure nights.

## 4. Close-Up coverage: sampled 1 day in 7

`/search_film_programmes/?date=DD-MM-YYYY` returns a **single day**, but the loop stepped
**7 days** for 10 iterations. Of the 32 days past the homepage JSON's coverage, it reached
**4**. The last five probes fell beyond the venue's real horizon, so half the search budget
could never return anything.

**Fixed**: a contiguous daily sweep bounded three ways rather than by a loop constant —
starts where the JSON's coverage actually ends (measured, not assumed, skipping ~9 days),
stops at the horizon `/film_programmes/` advertises (every heading ends with its final
screening date, so one request buys the real horizon), caps at `MAX_SEARCH_REQUESTS = 45`
with a 42-day fallback when the index is unreadable, and gives up after
`MAX_EMPTY_DAY_STREAK = 5`. Five was measured: the venue goes dark on scattered single
days (6, 15, 23, 29 October), so stopping on the first empty day would have truncated at
6 October and lost 34 of 59 screenings.

A challenge mid-sweep now stops and **keeps the pages already fetched** rather than
throwing, since a ~114s sweep against ~19-27 minute blocks makes interruption routine.
Safe because `pipeline.ts` contains no DELETE and superseded handling only reports
candidates.

**Verified live: 11 → 33 requests, 24 → 59 screenings**, 35 distinct days, contiguous
2026-09-22 → 10-31, 0 duplicate instants, 0 empty titles. The 35 recovered were computed
as a set difference; whole titles previously invisible include Maborosi, An Autumn Tale,
Morvern Callar, Khrustalyov My Car! and Pink Ulysses.

Also in `close-up.ts`: the yearless-"today" roll (tonight's `Sun 20 September, 6pm`
resolved to **2027**-09-20 — the same defect #750 fixed in `parseScreeningDate`, which this
scraper carried its own copy of) now defers to the shared parser; dedupe narrowed to the
start instant (registry and DB both say `screens: 1`, and across all 298 rows ever stored
18 of the 19 same-instant multi-title groups are variants of one film); and the homepage
listing is demoted to a title lookup for shows the JSON emits as `"title": null`, since it
is hand-written copy that contradicts the booking system.

## 5. Rich Mix deactivated — venue paused, scraper healthy

Rich Mix reported a critical yield drop (6.6 vs 67.6 baseline). The scraper is correct:
the venue **paused its entire cinema programme on 2026-08-27** for an 18-month, £2.2m
Arts Council-funded redevelopment, reopening autumn 2027.

Spektrix FILM instances run 258/239/191 per month Jun-Aug at 7-8/day, then stop dead after
2026-08-27 (1 on Aug 28, 1 on Sep 9, zero after) — which reproduces the 67.6 baseline
exactly as ~8-9 forward days at that rate. `?startFrom=2026-09-20` returns 11 instances,
**0 on FILM**. `richmix.org.uk/cinema/` server-renders "There are no films coming soon",
and the sitemap carries one `/cinema/` page (a schools-only Into Film festival).

The decisive control: the **same endpoint** returns current, correct non-film inventory that
the CMS sitemap independently corroborates, ruling out a dead tenant, a moved route and a
discovery fault in one query.

`active: false` in the registry drops it from the scrape roster and `scraper-health`. The
frontend map is unaffected (that reads the DB cinema row). **REVIEW 2026-08** to catch the
reopening; nothing re-checks the venue while the flag is false.

## Expect one new alert shape

Close-Up is parity-monitored: `"close-up film centre"` is in L-CUT's `VENUE_MAP` and
`close-up-cinema` is in `getScrapedCinemaIds()`, so `detectLcutRegressions` fires a
warn-level Telegram at `LCUT_REGRESSION_THRESHOLD = 5` missing screenings.

With `SWEEP_BUDGET_MS` a truncated horizon is now a **designed-for outcome** rather than a
fault, and a challenge landing mid-sweep produces the same shape. Both push Close-Up's
missing count toward that threshold, so the parity alert may fire as a second channel for
a cause the scrape digest already reports. Two things soften it: parity compares L-CUT
against the database rather than against the run, and nothing deletes, so rows from a
previous full sweep keep `missing` low through one truncated run; and the days at risk are
the far end of a 32-day span where Close-Up typically lists one or two shows a day. A
single short run should stay under 5. A run of them will not, and that is the signal
working correctly.

## Where the registry `active` filter lives, and why

`active: false` is honoured in `runWaves`, deliberately **not** at `SCRAPER_REGISTRY`
construction. Construction-time filtering would have broken three things:

1. `registry.test.ts` asserts by name that `scraper-rich-mix` is registered and builds
   `RichMixScraperV2` — the guard against the "three diverging registries" bug.
2. `getScraperByCliId` / `getCliEntries` read `SCRAPER_REGISTRY`, so `npm run
   scrape:rich-mix` and `/scrape-one rich-mix` would stop resolving. That is exactly how a
   future reader is told to confirm the 2027 reopening before flipping the flag back.
3. `getScrapedCinemaIds()` feeds L-CUT's `classifyLcutTargets`, which splits targets into
   report-only (`scraped`) and auto-insert (`sourceOnly`). Dropping an entry moves that
   venue into the auto-insert bucket, so the weekly run would start **writing third-party
   L-CUT rows for a venue someone deliberately switched off**. 28 `VENUE_MAP` ids are
   venues we scrape, including `close-up-cinema`, `ica`, `barbican`, `genesis`,
   `prince-charles` and both BFI venues. None of this fires for Rich Mix (it is absent from
   `VENUE_MAP`), but it would for the next deactivation.

Chains are never skipped by this filter: they already self-filter per venue via
`venues.filter((v) => v.active !== false)` (`everyman.ts:308/522`, and the same in
`curzon.ts` and `picturehouse.ts`), which is why the pre-existing inactive
`everyman-walthamstow` needs no special handling. Verified: exactly one entry skipped,
31 → 30 attempted.

## Impact

- **+844 screenings** recovered by the pool fix on the resume run; 25 venues that would
  otherwise have been skipped.
- **+35 Close-Up screenings per run** from the coverage fix, on a venue that had returned
  nothing for 42 days.
- Blocked Close-Up runs cost **1 request and 2.4s** instead of 13 requests and 79s, and now
  get a second chance in the same run.
- Rich Mix stops burning a critical health slot for a year.
- Two duplicate `close-up-html-*` rows deleted (the retired path's output; 22 historical
  rows preserved). The pipeline never deletes, so these would have persisted indefinitely.

## Not done, deliberately

- **Two venue-side am/pm typos** (`04:30 am : Winter Sleep`, a 196-minute film, and
  `08:15 am : Khrustalyov, My Car!`, contradicted by its own programme page). The scraper
  parses them faithfully and `screening-validator.ts` rejects both as
  `suspicious_time_early`, so 57 of 59 rows persist. Overriding an explicit AM/PM marker is
  the guesswork the time-parsing rules forbid; one missing row beats a wrong one.
- **`DB_POOL_MAX` remains env-only** and therefore untracked by git, so a fresh checkout
  reintroduces the precondition. The startup warning now names it loudly. Defaulting
  `poolMax` in `src/db/index.ts` was rejected because the default of 1 is deliberate for
  Vercel serverless safety.

## Review findings fixed before merge

A code review of this diff caught three defects in the new code, all fixed here:

1. **The challenge-retry phase could never fire.** `runScraperEntry` returned
   `{ succeeded }` with no error field, and `runScraper` never throws for a scrape failure
   (every error is folded into `venueResults`), so the caller only ever saw the generic
   `"scraper returned success=false"` and `isChallengeError` was always false. Fixed by
   aggregating the per-venue errors, joined rather than first-only so a chain with one
   blocked venue among healthy siblings still reports the block.
2. **`active: false` did not stop the scraper.** `SCRAPER_REGISTRY` had no `active` filter
   anywhere, so the flag reached only `checkAllCinemas`. Rich Mix would have kept scraping
   nightly and writing `scraper_runs` rows surfacing as zero-count anomalies. Fixed in
   `runWaves` (see above), rather than by weakening the comment.
3. **The day sweep could breach the venue cap and take the run down.** At ~250s of a 600s
   cap, with per-request latency rising above 10s under the 4-way pool and up to 105s per
   flaky day in `fetchWithRetry`, about four bad days breach it. A breach emits
   `"(venue wall-clock cap)"`, which `isConnectionError` matches, which feeds the run
   circuit breaker — re-creating this PR's own 25-venue outage from one slow venue. Fixed
   with `SWEEP_BUDGET_MS = 300_000` checked each iteration, so the sweep drops its tail
   instead. `MAX_SEARCH_REQUESTS` bounds request count, which is a different quantity from
   the time the cap measures.

## Verification

`npx tsc --noEmit` and `npx eslint` clean across all six files. Live scrapes verified
against closeupfilmcentre.com (18 Oct: `04:00 pm : The Terence Davies Trilogy` and
`08:15 pm : Le Samourai` → 16:00 and 20:15 UK) and richmix.org.uk. **Vitest cannot start on
this machine** (workers time out before loading any test file, both pools), so CI is the
gate for the suite.
