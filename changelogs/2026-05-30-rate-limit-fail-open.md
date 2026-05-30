# Rate limiter fails open when backing store is unavailable

**Date**: 2026-05-30
**Severity**: P0 incident fix (production outage)

## Changes
- `src/lib/rate-limit.ts`: wrapped the Upstash `rl.limit()` call in `checkRateLimit` in a try/catch. On any backing-store error the limiter now **fails open** by falling back to the existing per-instance in-memory limiter, instead of letting the error propagate.

## Root cause (incident 2026-05-30)
- Upstash Redis (the rate-limiter backing store) hit its **500,000-request quota** and began returning `ERR max requests limit exceeded` for every command.
- `checkRateLimit()` is the **first** call in essentially every API route (before the DB query). The unhandled throw became a `500 Internal server error` on every DB-backed endpoint (`/api/cinemas`, `/api/screenings`, …).
- The frontend SSR (`frontend/src/lib/server/api.ts` fetches `https://api.pictures.london`) then cascaded to `FUNCTION_INVOCATION_FAILED`, taking `www.pictures.london` down with it.
- A separate latent bug was also fixed during triage: the production `DATABASE_URL` env var had a trailing literal `\n`, corrupting the database name to `postgres\n` (`3D000`). That value would have broken DB queries once the request got past the rate limiter, so it was corrected too.

## Impact
- A backing-store outage (downtime, quota, network) can no longer take down the entire API. Rate limiting degrades gracefully to per-instance in-memory counting.
- Behavior is identical on the happy path (Upstash healthy → same limits, same responses).

## Follow-ups (not in this PR)
- Investigate/raise the Upstash request quota (root cause of the 500k overage).
- Restore the **preview** `DATABASE_URL` env var (removed during triage; PR preview deploys need it).
