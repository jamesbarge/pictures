# Client-side DB query timeout + pool-max override — fix the /scrape hang #479 didn't catch

**PR**: TBD
**Date**: 2026-05-07

## Symptom

Local `/scrape` hung at 32 cinemas in. Output silent for 87+ minutes after the line `[Pipeline] 58 valid screenings to process`. Process at 0.0% CPU, state `S` (sleeping). No errors in logs. No 60-second timeout fired.

This is the same failure shape as the original 12-hour hangs that #479 was meant to fix.

## Root cause

postgres-js + Supabase pooler half-open connection.

1. The Supabase transaction-mode pooler holds the underlying TCP socket between connection borrows.
2. Between query bursts (Wave 1 had been running for ~10 minutes), the pooler silently dropped its end of the socket without sending TCP RST.
3. The next query write from the client succeeded — TCP send buffer accepted the bytes locally.
4. The server never received the query (the pooler dropped it).
5. The client's `recv()` blocked forever waiting for a response.
6. Server-side `statement_timeout: 60_000` (added in #479) didn't fire because the server didn't see the query at all.
7. macOS default TCP keepalive is 7200 seconds — useless for this purpose.

## Why #479's timeouts didn't help

| Timeout | Scope | Why it didn't help |
|---|---|---|
| `statement_timeout: 60_000` | Server-side | Server never received the query |
| `idle_timeout: 20` | Client-side | Only kills *idle* connections, not borrowed ones |
| `connect_timeout: 15` | Client-side | Only governs initial handshake |
| `max_lifetime: 30min` | Client-side | Only rotates *released* connections, not in-flight ones |

There was no client-side hard ceiling on any individual query.

## Fix

### Part 1 — Query ceiling

Added `withDbTimeout<T>(p, ms = 10_000, label)` helper in `src/db/index.ts`:

```typescript
export function withDbTimeout<T>(
  p: Promise<T>,
  ms = 10_000,
  label = "db query",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms (client-side)`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
```

Applied at every hot-path DB call in `runScraperPipeline`:

| Site | Ceiling | Why |
|---|---|---|
| `generateScrapeDiff` cinema lookup | 15s | Single-row select, p99 ≪1s |
| `generateScrapeDiff` existing screenings | 15s | Joined select, p99 ≪1s |
| `initFilmCache` films table load | 15s | ~1.2k rows full scan |
| `getOrCreateFilm` (per-film) | 20s | Includes TMDB API calls |
| `linkFilmToMatchingSeasons` (per-film) | 10s | Tiny lookup + optional inserts |
| `insertScreening` (per-screening) | 15s | `checkForDuplicate` + insert/update |

### Part 2 — No cascading failure

Pool `max` is now configurable via `DB_POOL_MAX` env var:

- Default `1` — preserves serverless-safe behavior on Vercel
- Local `.env.local`: bump to `3`

Without this, a single wedged connection on `max: 1` would block every subsequent query for up to 30 minutes until `max_lifetime` rotated it. With `max: 3` locally, two healthy slots keep the run moving while the wedged one drains.

## Recovery posture

On timeout the wrapper throws. The error propagates up to the per-cinema try/catch in `src/scrapers/pipeline.ts` (and to the per-film inner try/catch where applicable). Same posture as the existing `57014` (query_canceled) catch path — a single film loses, the rest of the cinema continues; if the whole cinema's prelude wedges, the cinema is skipped and the run continues.

## What this still doesn't do (deferred)

`Promise.race` only stops *waiting*. The underlying postgres-js promise is still alive, holding its connection slot until eventual rejection or `max_lifetime` rotation. With `DB_POOL_MAX=3`, this is fine — there are healthy slots available.

A more thorough fix would force-recreate the postgres-js client on timeout (`client.end({ timeout: 0 })` + new client). That requires re-architecting the `db = drizzle(...)` const export, which is referenced widely. Deferred until evidence demands it.

Other unwrapped DB calls (intentionally — they are not on the per-cinema hot path):

- `cleanupSupersededScreenings` (post-loop cleanup)
- `db.update(cinemas).set({ lastScrapedAt })` (single-row update at end of pipeline)
- The 6 queries inside `screening-classification.ts` (called *inside* `insertScreening`, which is wrapped at the call site — covered transitively)

## Verification

- 890/890 tests pass.
- `npx tsc --noEmit` clean.
- `npm run lint` clean (0 errors, 41 pre-existing warnings unchanged).
- Pending: end-to-end re-run of `/scrape` after merge.

## Code review

Reviewed by the project's code-reviewer agent before commit. The reviewer raised three substantive issues, two of which were addressed in-PR:

1. Recovery posture (cascading failure with `max: 1`) — addressed via `DB_POOL_MAX` env var.
2. Coverage gaps (per-film loop unwrapped) — addressed by wrapping `getOrCreateFilm`, `linkFilmToMatchingSeasons`, and `insertScreening` at the call-site boundary.
3. Client-recreate on timeout — deferred (see above).

Threshold also tightened from the initial 30s to 10–20s based on reviewer feedback (p99 is sub-1s).
