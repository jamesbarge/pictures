# Curzon healthCheck unit test (401-is-healthy)

**PR**: #718
**Date**: 2026-06-21
**Issue**: PIC-29

## Changes
- Added a `Curzon healthCheck (401-is-healthy contract)` describe block to `src/scrapers/chains/curzon.test.ts`.
- Stubs global `fetch` and asserts the four cases: `401` → healthy, `2xx` → healthy, `5xx` → unhealthy, network error/timeout → unhealthy.

## Context
- The implementation already exists and is correct on `main` (`src/scrapers/chains/curzon.ts` `healthCheck()` returns `response.status === 401 || response.ok`, with a `catch` → `false`). Cloudflare blocks HEAD on `www.curzon.com`, so the scraper probes the Vista API endpoint; a `401` proves Cloudflare let the request through and the API is up.
- PIC-29's "done-when" required this behaviour to be **covered by a unit test**; that test was missing. This closes the gap — no production code changed.

## Impact
- Locks in the 401-is-healthy contract so a future refactor can't silently turn Curzon's health check into a false-negative (which would wrongly mark the scraper down).
- Verified via CI (local vitest workers time out under disk pressure in this environment).
