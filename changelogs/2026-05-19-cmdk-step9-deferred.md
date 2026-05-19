# cmd+k step 9 — DEFERRED to v2

**Date**: 2026-05-19
**Status**: Deferred (not implemented)

## What was deferred

The original plan (`tasks/cmdk-palette-plan.md`, §7) scoped a client-side Orama index for cold-cache TTFR <50ms:

- `/api/search/index` edge endpoint serving an ~88KB brotli-compressed columnar payload
- `/api/search/index/meta` endpoint for revalidation
- Web Worker build (Orama `create` + `insertMultiple`)
- IndexedDB cache with 100ms read timeout
- Lazy hook (`ensureClientIndex()`) on first ⌘K
- Optional idle-prefetch 5s after homepage load

## Why deferred

Measured TTFR on the deployed step-7 path:

| Scenario | TTFR |
|---|---|
| Cold (no client index) | ~100ms |
| Warm IDB hit (step 9 target) | ~50ms |
| Server-only (current) | ~100ms |

The server-only path already feels snappy. The ~50ms cold→warm delta is meaningful on slow networks, but:

- It adds ~88KB JS bundle, Web Worker, IDB, brotli-wasm — non-trivial build and ops surface
- The plan flagged step 9 as the largest item (effort=L)
- "Working brilliantly" (the goal) is already achieved with sub-100ms server p95

## When to revisit

Reopen step 9 if any of these signal:

- Production telemetry (palette PostHog events) shows cold-cache p95 TTFR > 300ms on real devices
- Mobile/4G users report perceptible lag
- We add fuzzy search to a route where the server round-trip dominates (e.g. an admin dashboard)

## Workaround in place

- AbortController + 80ms debounce in `palette.svelte.ts` keeps server fetches tight
- Synthesised filter-action rows from `intent-to-actions.ts` render instantly (no network) — they cover the "5-second magic" case without an index
- Trigram fuzzy matching at the DB layer covers the typo-tolerance use case that the Orama BM25+fuzzy index was meant to handle client-side

This deferral is documented in `tasks/cmdk-palette-plan.md` Section 10 (step 9 row marked deferred) and `MEMORY.md`.
