# Plan 010: Pipeline write-resilience — insert retry queue, validator provenance, progress-file fix

> **Executor instructions**: Follow step by step; honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 716e543..HEAD -- src/scrapers/pipeline.ts src/scrapers/base.ts src/scrapers/types.ts`
> Also check whether plan 001 (circuit breaker) has landed:
> `grep -n "isConnectionError" src/scrapers/runner-factory.ts` — this plan
> reuses that classifier. If 001 hasn't landed, do 001 first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: 001 (reuses `isConnectionError`; watchdog interplay)
- **Planned at**: commit `716e543`, 2026-06-11

## Why this matters

Observed during the 2026-06-11 runs:

1. **Dropped writes, no retry**: `insertScreening … timeout after 15000ms`
   cost 19 screenings at electric-white-city and 17 at rich-mix; more at
   castle/the-nickel. The pipeline counts them as `failed` and moves on —
   the data is simply absent until the next weekly run.
2. **Validator rejects real screenings from API sources**: Everyman
   Barnet's 09:00 shows (kids/early screenings) were rejected as
   `suspicious_time_early`. That guard exists to catch AM/PM *text-parsing*
   errors — Everyman times arrive as unambiguous ISO timestamps. Similarly,
   bookable long-lead event cinema (Met Opera 2026-27 at Curzon Mayfair,
   99–176 days out) is discarded by the 90-day `too_far_future` cap.
3. **Progress file write fails every time**: `rename … tmp/scrape-progress.json`
   ENOENT — the `tmp/` dir isn't created by code. (Dir was created manually
   on this Mac on 2026-06-11; fresh checkouts still regress.)

## Current state

- `src/scrapers/pipeline.ts` — film-loop catches per-film errors
  (`[Pipeline] Error processing film "x": …`), increments `failed`,
  continues. No retry pass. Insert wrapper: `withDbTimeout(…, 15_000, 'insertScreening: …')`
  via `src/db/index.ts:97`.
- `src/scrapers/base.ts:85-116` — `validate()` filters invalid/past
  screenings. The early-time and future-cap rules live in the validator
  layer (grep `suspicious_time_early` and `too_far_future` for exact sites —
  they appear in run logs as `[Validator] REJECTED <title>: <rule>`).
- `RawScreening` (src/scrapers/types.ts) has no notion of how its datetime
  was derived (text-parsed vs ISO).
- Progress writer: grep `scrape-progress.json` to locate; it does
  `rename(tmp file → final)` without ensuring the directory.

## Scope

**In scope**: `src/scrapers/pipeline.ts`, the validator site(s) in
`src/scrapers/base.ts` (and wherever `too_far_future` lives),
`src/scrapers/types.ts` (one optional field), the progress writer, scrapers
that parse ISO timestamps (flag-setting only — Curzon, Picturehouse,
Everyman, Castle), tests, changelogs.

**Out of scope**: the wedge itself (001's watchdog); pool sizing/DB config;
diff-report heuristics.

## Git workflow

Branch `fix/pipeline-write-resilience`; conventional commits; both
changelogs; code-reviewer agent before PR.

## Steps

### Step 1: mkdir for the progress file (smallest fix first)

In the progress writer, before the rename:

```ts
import { mkdirSync } from "fs";
import { dirname } from "path";
mkdirSync(dirname(PROGRESS_PATH), { recursive: true });
```

(Once, at module init or first write — not per write.) Test: point the path
at a non-existent temp dir; write succeeds.

**Commit**: `fix(scrape): create tmp dir before progress-file writes`.

### Step 2: end-of-venue retry queue for timed-out writes

In `pipeline.ts`'s film/screening loop, when a caught error satisfies
`isConnectionError(err)` (import from runner-factory, landed in 001), push
the work item onto a `deferredWrites` array instead of just counting a
failure. After the venue's main loop (before `cleanup-superseded`):

```ts
if (deferredWrites.length > 0) {
  console.log(`[Pipeline] Retrying ${deferredWrites.length} deferred writes (serial, 1s gap)`);
  for (const w of deferredWrites) {
    await sleep(1000);                      // let the pool breathe
    try { await w.run(); retried.ok++; }
    catch (e) { retried.failed++; log…  }   // second failure is final this run
  }
}
```

Design constraints:
- Retry **once**, serially, with a gap — the failure mode is pool
  contention; hammering in parallel recreates it.
- Cap the queue (e.g. 50/venue); beyond that, the venue is sick and 001's
  breaker should be the responder — log and drop.
- The deferred item must capture everything needed to re-run
  (`() => insertScreening(...)` thunk closing over prepared values), NOT
  re-do TMDB matching.
- Final counts: `Complete: X added, Y updated, Z failed (W recovered on retry)`.

Tests (mock db insert to fail once with a timeout-shaped error, then
succeed): recovered count increments; a twice-failing write lands in
`failed`; non-connection errors (e.g. FK violation) are NOT retried.

**Commit**: `feat(scrape): retry queue for connection-timeout writes`.

### Step 3: time-provenance flag + validator awareness

3a. `RawScreening` gains:

```ts
  /** How datetime was derived. ISO/API timestamps can't have AM/PM errors. */
  timeSource?: "iso" | "text";
```

3b. Set `timeSource: "iso"` in the scrapers that parse ISO/API timestamps:
Curzon, Picturehouse, Everyman (all use `parseUKLocalDateTime` on ISO
strings), Castle (`data-start-time` ISO attribute). Leave text-parsed
scrapers unset (treated as `"text"`).

3c. In the validator: `suspicious_time_early` becomes **warn-only (keep the
screening)** when `timeSource === "iso"`; unchanged (reject) for text. The
log line must still appear so /scrape output surfaces it.

3d. `too_far_future` (90-day cap): raise to 90 days for `timeSource:"text"`,
**180 days for `"iso"`** — long-lead event cinema (Met Opera/RBO/NT Live)
is API-sourced at the chains and is exactly the high-value advance booking
the cap currently discards. Do not remove the cap entirely (it also guards
against parse-year errors like 2027-for-2026).

Tests: 09:00 ISO screening passes with a warning; 09:00 text screening
still rejected; 120-day ISO screening passes; 120-day text screening
rejected.

**Commit**: `fix(scrape): time-provenance-aware validation (early times, future cap)`.

### Step 4: changelogs, review, PR

Both changelogs; code-reviewer agent; PR. In the PR description, note the
expected user-visible effect: Everyman morning kids' shows and Met Opera
2026-27 dates appear on the calendar after the next scrape.

## Done criteria

- [ ] tsc/lint/test:run green
- [ ] Retry-queue tests pass (recover-once / fail-twice / non-connection-not-retried)
- [ ] Provenance tests pass (4 cases in Step 3)
- [ ] A full single-venue run of everyman (`/scrape-one` path) shows 09:00
      screenings surviving with a warning
- [ ] Progress file writes succeed from a clean checkout (delete `tmp/`, run, check)
- [ ] Changelogs + `plans/README.md` updated

## STOP conditions

- Plan 001 not landed (no `isConnectionError` to reuse).
- The deferred-write thunk can't be constructed without re-running matching
  (would change the design — report).
- Raising the ISO future-cap surfaces >500 new screenings in dry testing
  (sanity check the data before shipping).
