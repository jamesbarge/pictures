# Add unit tests for withDbTimeout

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/db/with-timeout.test.ts` (new) — 6 cases for `withDbTimeout` from src/db/index.ts.

## Coverage
- Inner promise resolves → returns value
- Inner promise hangs → rejects with timeout error after specified ms
- Default label ('db query')
- Default timeout (10000ms) — verified not-fired at 9999ms, fired at 10000ms
- Inner promise rejection propagates (no timeout-wrap)
- Timer cleanup on resolution (no orphan setTimeout, no unhandled rejection)

## Why
withDbTimeout wraps every DB call across the scraper pipeline (per the pipeline.ts try/catch pattern documented in the source). A regression to the timeout error message breaks log-parsing in CloudWatch; a regression to the timer cleanup leaks setTimeout handles across long-running pipeline batches (eventually crashes the process with `MaxListenersExceededWarning`).

The "timer cleanup on resolution" test in particular guards against the easy-to-introduce regression of dropping the `.finally(clearTimeout)` chain.

## Changelog deferral note
Per #523-#530.
