# Rate-limiter fail-open unit tests

**PR**: #719 (supersedes #714)
**Date**: 2026-06-21
**Issue**: PIC-13

## Changes
- Added a `checkRateLimit (fail-open when the Redis backend throws)` describe block to `src/lib/rate-limit.test.ts`.
- Mocks `@upstash/redis` and `@upstash/ratelimit` (via `vi.hoisted` + `vi.mock`) and stubs `KV_REST_API_URL` / `KV_REST_API_TOKEN` so a freshly re-imported module takes the Redis-backed path.
- Three cases:
  1. `rl.limit()` rejects → `checkRateLimit` **resolves** (`success:true`, `remaining:4`) and logs `"failing open"` — proving the route does not 500.
  2. After the backend fails, the in-memory fallback **still enforces** the limit (3rd request over a limit of 2 is blocked) — fail-open is not fail-through.
  3. Happy path: `rl.limit()` resolves → the Redis result is returned with `resetIn` derived from `reset`.

## Impact
- Locks in the fix from PR #584 (2026-05-30 outage: Upstash hit its 500k request quota and the non-fail-open limiter 500'd every DB-backed route). Any future regression that lets the limiter throw on backend failure will now fail CI.
- Test-only change; no runtime behaviour modified.
- Verified via CI (local vitest workers time out under disk pressure in this environment).
