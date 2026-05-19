# Add unit tests for src/scrapers/utils/health-check.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/utils/health-check.test.ts` (new) — 8 vitest cases mocking `globalThis.fetch`.

## Coverage
- 2xx → true (200 explicit)
- 4xx → false
- 5xx → false
- Network error (fetch throws) → false (catch-all swallows)
- HEAD method used by default
- Custom RequestInit options (headers, AbortSignal) merged with HEAD
- **Pinned precedence**: caller-supplied `method` overrides HEAD via the `{method: "HEAD", ...options}` spread (rare but supported; pinning so a refactor doesn't invert precedence)

## Why
`checkHealth` is called from `BaseScraper.healthCheck()` and from the scraper boot probe — a regression to "return false" semantics silently disables cinemas in production; a regression to "throw instead of catch" crashes the pre-flight wave runner.

## Impact
- Functional: none. Pure test addition.
- Coverage: 17-line untested fetch wrapper → 100% line coverage.

## Verification
`npx vitest run src/scrapers/utils/health-check.test.ts` — 8 passed, 0 failed, 607ms.

## Side discovery during development
First attempt used `new Response("", { status: 204 })` for the "any 2xx" test — but the Response constructor rejects 204 with a non-empty body. Switched to 200. Documenting so future contributors writing similar tests know the Response constructor's no-body status rules.

## Changelog deferral note
Per #523-#530, omits the `RECENT_CHANGES.md` top-of-file entry. Batched next.
