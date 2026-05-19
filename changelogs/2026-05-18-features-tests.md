# Add unit tests for src/lib/features.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/features.test.ts` (new) — 5 vitest cases.

## Coverage
- Type contract: returns boolean for known flag keys
- Snapshot stability: same value across calls
- **Pinned snapshot semantics**: `FEATURE_FLAGS` is computed at module load; post-import `process.env` mutations have no effect. Documented so a refactor to per-call env reads (which would break Next.js build-time inlining) gets caught.
- **Pinned strict-equality contract**: `process.env.X === "true"` exactly — `"1"`, `"yes"`, etc. are NOT truthy.

## Why
Feature flags gate the live `festivals` and `seasons` UI surfaces. A regression to per-call env reads breaks Next.js inlining (env values are only inlined when read at module-init time). A regression to loose-equality (`Boolean(process.env.X)`) would interpret an empty string as false but "false" as true, opening a silent footgun for ops.

## Changelog deferral note
Per #523-#530.
