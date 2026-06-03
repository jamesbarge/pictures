# Add unit tests for src/scrapers/utils/fetch-with-retry.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/utils/fetch-with-retry.test.ts` (new) — 10 vitest cases using `vi.useFakeTimers()` to compress the 2-second retry backoff and `vi.fn()` to mock `globalThis.fetch`.

## Coverage
- First-attempt success (status 200, single fetch call)
- 4xx response (no retry — `status < 500` returns immediately)
- 5xx → success retry path (advances 2s timer, asserts 2 fetch calls)
- Network error (fetch rejects) → success retry path
- Two consecutive 5xx → returns the final 5xx response (pins "exactly one retry, no double-retry")
- Content-Length > default 10MB → throws with size-exceeded message
- Custom `maxResponseSize` honored
- Missing Content-Length header → size check skipped
- Label is used in the size-exceeded error message
- Options (method, headers) forwarded to underlying fetch

## Why
This utility is called by the BFI PDF fetcher and the programme-changes parser — both ingest external data on a schedule. A regression that breaks the retry logic silently increases failure rates against transient upstream errors; a regression that breaks the size guard silently risks OOM in CI from a mis-served oversized payload.

## Pinned surprising contract
**Size-limit failures ARE retried.** When the size check throws, it lands in the same `catch` block as a network error, then the function sleeps 2s and calls `doFetch()` again. For a server consistently returning oversized responses, this wastes 2 seconds per call before failing. Documented in the test "throws when Content-Length exceeds the default 10MB limit (both attempts)" — pinning so future refactors know to make this an explicit design decision rather than an accident.

## Impact
- Functional: none. Pure test addition.
- Coverage: lifts a 52-line untested retry utility to 100% line coverage.
- Future-proofing: the size-limit retry behaviour, the "exactly one retry" guarantee, and the label propagation are now under test.

## Verification
`npx vitest run src/scrapers/utils/fetch-with-retry.test.ts` — 10 passed, 0 failed, 572ms.

## Side discovery
Initial test attempts using `expect(...).rejects.toThrow()` without advancing timers hung (10s timeout). Root cause: even error paths go through the 2s `setTimeout` backoff before the second `doFetch()`. Tests now use `vi.advanceTimersByTimeAsync(2000)` for all paths that don't return on the first attempt. This is itself a useful finding — anyone writing additional tests for this module needs the same pattern.

## Changelog deferral note
Per the pattern in #523/#524/#525/#526, this PR omits the `RECENT_CHANGES.md` top-of-file entry to avoid rebase cascade. Batch catchup PR planned for session end.
