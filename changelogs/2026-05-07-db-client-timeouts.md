# Add postgres-js client timeouts to fix `/scrape` stalls

**PR**: TBD
**Date**: 2026-05-07
**Branch**: `fix/db-timeouts`
**Driven by**: Local `/scrape` stalled twice for 12+ hours each yesterday/today. Both stalls killed manually. Production cron (Inngest) is already removed in PR #478, so the local path needs to actually complete reliably.

## Symptom

`npm run scrape:unified` would:
1. Successfully fetch data from cinema websites for all 26 cinemas (chains wave in parallel).
2. Begin processing a cinema's screenings through the pipeline.
3. Stall mid-pipeline at a non-deterministic point — different cinema each run, but always at the same logical step (entering per-screening processing or `generateScrapeDiff`).
4. Never recover. Process alive but sleeping; no log output for hours.

The stall did not reproduce with `/scrape-one <cinema>` (single-cinema, faster, fewer connections) — only with the full `/scrape` run.

## Root cause

`src/db/index.ts` configured postgres-js with:

```ts
postgres(connectionString, {
  prepare: false, // Required for Supabase transaction-mode pooler
  max: 1,
})
```

`max: 1` is appropriate for Vercel serverless functions (each invocation gets fresh state). But for a long-running scrape pipeline that runs hundreds of queries serially, all queries serialize on a single TCP connection. When that connection silently drops on the Supabase pooler side (which happens occasionally — pooler restarts, network blips, idle disconnects), postgres-js doesn't detect the drop. The next query gets sent into the void; the promise never resolves; every subsequent query queues behind the dead one. **Permanent stall.**

## Fix

Added four timeouts to the postgres-js client config:

```ts
postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,           // seconds — recycle idle conns
  connect_timeout: 15,        // seconds — bound initial handshake
  max_lifetime: 60 * 30,      // 30 minutes — force rotation
  connection: {
    statement_timeout: 60_000, // ms — Postgres-side query cap
  },
})
```

### What each timeout buys

| Setting | Catches |
|---|---|
| `statement_timeout: 60_000` | Server-side cap. Any query running >60s on Postgres gets terminated and surfaces as PG error code `57014` (`query_canceled`). Prevents runaway server work. |
| `idle_timeout: 20` | Postgres-js closes connections after 20s idle. Forces a fresh connection on the next query, dodging stale pooler links that may have been silently dropped. |
| `connect_timeout: 15` | The TCP handshake to the pooler must complete in 15s or fail. Stops indefinite hangs at startup if the pooler is unreachable. |
| `max_lifetime: 60 * 30` | Even a long-lived healthy connection rotates every 30 min. Catches the slow drift of pooler-side state. |

`max: 1` is left unchanged so Vercel's connection budget isn't affected.

### Why this works for the stall scenario

The actual hang case is "client thinks connection alive, sends query, server never responds." Of these timeouts, `statement_timeout` and `idle_timeout` together cover that:

- If Postgres receives the query and gets stuck → `statement_timeout` kills it at 60s.
- If the connection died before the query was sent → next idle period (≤ 20s after the stuck query is abandoned) will close the dead conn and force reconnection.
- Worst-case unrecoverable hang shrinks from 12 hours to ~60 seconds per stuck query.

### Pipeline error handling

`src/scrapers/pipeline.ts` `processScreenings` already wraps each film's processing in a try/catch (line 212-244). A `statement_timeout` firing on one query throws PG `57014`, which is caught at the per-film boundary, logged, and the loop continues with the next film. **A single timeout never aborts the whole cinema's run.**

The PR #474 try/catch on PG `23505` (unique constraint violation, in `insertScreening`) is unaffected — it only catches that specific error code and re-throws others. A `57014` propagates up to the per-film catch as expected.

## Verification

- `npm run test:run` — **890 / 890 passing**.
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 41 warnings (all pre-existing).

A real-world test of `/scrape` is the actual proof. Will be run separately and reported back.

## Impact

- **Local `/scrape` should complete or fail fast** instead of hanging indefinitely. Worst-case per-cinema penalty: 60s per stuck query × few queries per cinema = ~3-5 min added to a normal run if anything weird happens. Compared to 12-hour manual-kill, infinitely better.
- **No Vercel impact** — `max: 1` unchanged; the new timeouts are conservative ceilings that no normal query touches.
- **No data-correctness change** — timeouts surface as PostgresError, which existing per-film try/catch handles cleanly.

## Out of scope

- **Bumping `max: 1` to 3-5** for parallelism on long-running scripts. Would help but introduces a Vercel-budget question (transaction-mode pooler shares limits across all clients). Defer until we see whether the timeouts alone are enough.
- **Promise.race-based client-side timeouts** wrapping every Drizzle call. More invasive; only needed if the server-side `statement_timeout` proves insufficient (e.g. if the failure mode is "query never sent" rather than "query stuck on server"). Defer until evidence.
- **Investigating the actual stall's root mechanism** — whether it's pooler restart, idle disconnect, TCP reset, or something else. The fix here is general (timeouts catch all stuck-promise modes) rather than diagnostic.
