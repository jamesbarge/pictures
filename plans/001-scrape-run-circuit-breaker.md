# Plan 001: Add a run-level circuit breaker and per-venue wall-clock cap to the scrape pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ed1db0..HEAD -- src/lib/jobs/scrape-all.ts src/scrapers/runner-factory.ts src/db/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8ed1db0`, 2026-06-10

## Why this matters

On 2026-06-09 a full `/scrape` run stalled for **13.7 hours**: four cinemas
(`castle`, `castle-sidcup`, `peckhamplex`, `bertha-dochouse`) each ran ~13.4h
because a post-scrape DB query hung on a silently-dropped Supabase pooler
connection and retried futilely. This exhausted the pooler's connection slots,
which took the **entire production database** offline and prevented ~9 other
cinemas from scraping at all. The pipeline has no run-level wall-clock cap and
no circuit breaker, so one mid-run DB hiccup cascades into a multi-hour outage.
After this plan, a run with a wedged DB aborts in **minutes, not hours**, and no
single venue can run longer than a hard cap.

## Current state

- `src/lib/jobs/scrape-all.ts` — the orchestrator. Fans scrapers out in 4 waves
  using `runWithConcurrency(tasks, 4)`. Each task is a call to `runScraperEntry`,
  which calls `runScraper(...)` and returns `{ succeeded: boolean; error?: string }`.
  There is **no shared state that stops the run early** when failures pile up.
  - `runWithConcurrency` (lines ~104–120): worker-pool over an array of thunks;
    never rejects — captures results as `PromiseSettledResult`.
  - `runScraperEntry` (lines ~123–173): wraps one registry entry; the `catch`
    returns `{ succeeded: false, error: message }`.
- `src/scrapers/runner-factory.ts` — `runScraperInner` (lines 503–706) loops over
  venues. The multi-venue loop (lines 543–562) calls `runSingleVenue(venue, scraper, options)`
  **with no timeout around the call**:
  ```ts
  for (const venue of venuesToScrape) {
    await ensureCinemaExists({ ... });
    const scraper = config.createScraper(venue.id);
    const result = await runSingleVenue(venue, scraper, options);   // ← can hang indefinitely
    venueResults.push(result);
    if (!result.success && !options.continueOnError) break;
  }
  ```
- `src/db/index.ts` — `withDbTimeout(p, ms, label)` (lines 89–104) already bounds
  an individual DB call (stops *waiting* on the promise, doesn't release the
  socket). The incident showed per-query timeouts are **not enough**: retries
  against a dead pooler still burned 13h. A run-level breaker is the missing layer.

Conventions to match:
- Structured logging via the `log({ level, event, data })` helper already used
  throughout `runner-factory.ts` (e.g. line 511). Use it for breaker events.
- Config/env knobs follow the `process.env.X ? ... : default` pattern — see
  `DB_POOL_MAX` handling in `src/db/index.ts:38-40`.
- The recovery design is recorded in `tasks/todo.md` ("Phase 1 (KEYSTONE)"):
  run-level circuit breaker that aborts after K consecutive connection-error
  venue failures; per-venue hard wall-clock cap (AbortController); treat
  connection-level failures as non-retryable.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                                   | exit 0 (pre-existing `.next/**` stale-type errors may print; no NEW errors in `src/`) |
| Tests     | `npm run test:run`                                   | all pass            |
| Lint      | `npm run lint`                                        | exit 0, 0 errors    |
| Scoped test | `npx vitest run src/scrapers/runner-factory.test.ts src/lib/jobs/scrape-all.test.ts` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/jobs/scrape-all.ts` — add the run-level circuit breaker.
- `src/scrapers/runner-factory.ts` — add the per-venue wall-clock cap.
- `src/lib/jobs/scrape-all.test.ts` (create if absent) — breaker tests.
- `src/scrapers/runner-factory.test.ts` (create if absent) — per-venue cap test.

**Out of scope** (do NOT touch, even though they look related):
- `src/db/index.ts` — `withDbTimeout` stays as-is; the breaker is a separate layer.
- The individual scrapers in `src/scrapers/cinemas/**` and `src/scrapers/chains/**`.
- Any change that moves scraping off the local Mac (e.g. cloud cron). The
  maintainer requires scraping to stay local — `/scrape` is the only path.

## Git workflow

- Branch: `fix/scrape-circuit-breaker`
- Conventional commits (e.g. `fix(scrape): add run-level circuit breaker`).
- Include `Co-Authored-By: Claude <noreply@anthropic.com>` when AI-assisted.
- Do NOT push or open a PR unless the operator instructed it.
- Update BOTH changelog locations (`RECENT_CHANGES.md` top entry +
  `changelogs/YYYY-MM-DD-scrape-circuit-breaker.md`) — this repo requires it on
  every change. See an existing entry in `RECENT_CHANGES.md` for the format.

## Steps

### Step 1: Add a connection-error classifier

In `src/scrapers/runner-factory.ts`, add an exported helper that decides whether
an error is a non-retryable connection/pooler failure (vs a normal site error):

```ts
/** True if the error looks like a DB connection/pooler failure (non-retryable at run level). */
export function isConnectionError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("timeout") ||           // withDbTimeout client-side reject
    msg.includes("econnrefused") ||
    msg.includes("connection") ||
    msg.includes("pool") ||
    msg.includes("57014") ||             // query_canceled (statement_timeout)
    msg.includes("terminating connection")
  );
}
```

**Verify**: `npx tsc --noEmit` → no new `src/` errors.

### Step 2: Add a per-venue wall-clock cap in the multi-venue loop

In `runScraperInner` (multi-venue branch, lines 543–562), wrap the
`runSingleVenue` call in a timeout race so no single venue can exceed a hard cap
(default 10 min, override via `SCRAPE_VENUE_TIMEOUT_MS`). On timeout, record the
venue as failed and continue. Reuse the `withDbTimeout` pattern shape but as a
local `withVenueTimeout` (do not import DB internals for non-DB work — define a
small local race helper, or reuse `Promise.race` inline). Apply the same cap to
the single-venue branch (line 534) and chain branch (line 590, around
`chainScraper.scrapeVenues`).

Target shape for the venue cap:
```ts
const VENUE_TIMEOUT_MS = process.env.SCRAPE_VENUE_TIMEOUT_MS
  ? Math.max(60_000, Number(process.env.SCRAPE_VENUE_TIMEOUT_MS))
  : 10 * 60_000;
```

**Verify**: `npx vitest run src/scrapers/runner-factory.test.ts` → the new
"aborts a venue that exceeds the cap" test passes (see Test plan).

### Step 3: Add the run-level circuit breaker in scrape-all.ts

In `src/lib/jobs/scrape-all.ts`, introduce run-scoped breaker state and consult
it inside `runWithConcurrency`'s `worker()` loop (before starting each task) and
in `runScraperEntry` (after each result):

- Track `consecutiveConnFailures` (a counter in `runScrapeAll`'s scope, threaded
  into the wave runners).
- In `runScraperEntry`'s `catch`, if `isConnectionError(err)`, increment the
  counter; on any success or non-connection error, reset it to 0.
- A breaker threshold `K` (default 3, override `SCRAPE_BREAKER_THRESHOLD`). When
  `consecutiveConnFailures >= K`, set a `tripped` flag.
- In `runWithConcurrency`'s `worker()`, check the `tripped` flag at the top of
  the loop; if tripped, stop pulling new tasks (return early) and record the
  remaining entries as skipped/failed with reason `"circuit breaker tripped"`.
- Emit a structured log + (reuse existing `sendTelegramAlert`) when the breaker
  trips, naming the count and the failing cinema.

Keep `runWithConcurrency` generic — pass the breaker as an optional
`shouldStop: () => boolean` callback parameter rather than hard-coding scrape
concepts into the pool helper.

**Verify**: `npx vitest run src/lib/jobs/scrape-all.test.ts` → breaker tests pass.

### Step 4: Update changelogs

Add the top entry to `RECENT_CHANGES.md` and create
`changelogs/2026-06-10-scrape-circuit-breaker.md` (use today's date if later).

**Verify**: `git status` shows both changelog files modified/created.

## Test plan

- `src/scrapers/runner-factory.test.ts` (create):
  - `isConnectionError` classifies timeout/pool/57014 messages as `true`, a
    plain "Found 0 screenings" / "site not accessible" as `false`.
  - "aborts a venue that exceeds the cap": stub `runSingleVenue` (or the scraper)
    to return a promise that never resolves; with `SCRAPE_VENUE_TIMEOUT_MS` set
    low (e.g. 50ms), the venue result is `success: false` with a timeout error
    and the loop continues to the next venue. Use vitest fake timers.
- `src/lib/jobs/scrape-all.test.ts` (create):
  - "trips after K consecutive connection failures": feed tasks that throw
    connection errors; assert that after K, remaining tasks are not started and
    are recorded as `circuit breaker tripped`.
  - "does not trip on interleaved successes": a connection failure followed by a
    success resets the counter; the run completes all tasks.
- Structural pattern to follow: an existing route/unit test that uses
  `vi.mock`, e.g. `src/app/api/admin/agents/agents.test.ts`.
- Verification: `npm run test:run` → all pass, including the new tests.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` → no new errors under `src/`
- [ ] `npm run lint` → exit 0, 0 errors
- [ ] `npm run test:run` → all pass; new tests for the breaker and venue cap exist and pass
- [ ] `grep -n "shouldStop\|isConnectionError\|VENUE_TIMEOUT" src/lib/jobs/scrape-all.ts src/scrapers/runner-factory.ts` returns matches in both files
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] Both changelog locations updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at lines 543–562 of `runner-factory.ts` or `runWithConcurrency` in
  `scrape-all.ts` no longer matches the excerpts above (drift).
- You cannot write a deterministic test for the venue cap without real timers
  or a live DB (fake timers should suffice — if not, report).
- Implementing the breaker appears to require changing `src/db/index.ts` or a
  scraper file (out of scope).
- The threshold/timeout behaviour interacts with an existing retry mechanism in
  `runSingleVenue` you did not expect — surface it before proceeding.

## Maintenance notes

- If scraping ever moves to true parallelism beyond the current wave cap of 4,
  the breaker counter must become concurrency-safe (atomic increment) — today's
  worker pool mutates shared state cooperatively, which is fine at cap 4.
- A reviewer should scrutinise: (1) that `isConnectionError` is not so broad it
  trips on normal site errors, and (2) that the venue cap's timeout actually
  abandons the await (Promise.race) rather than just logging.
- Deferred out of this plan: generalising the BFI "reconcile-sweep" into the
  pipeline (separate finding); making connection-level failures non-retryable
  *inside* `runSingleVenue` if it has its own retry loop (investigate first).
