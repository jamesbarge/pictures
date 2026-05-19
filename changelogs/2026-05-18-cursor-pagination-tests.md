# Add unit tests for cursor-pagination primitives in screening.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/db/repositories/cursor-pagination.test.ts` (new) — 10 vitest cases for `parseCursor` + `buildCursor` + roundtrip integrity.

## Why
Cursor-based pagination drives the `/api/screenings` infinite-scroll experience. A regression in parse/build silently corrupts pagination (duplicates, missed rows, infinite loops). The pure-function pair is perfect for round-trip testing.

## Coverage
- parseCursor:
  - Happy path: splits at LAST `_` (UUID right of split)
  - No underscore → null
  - Empty datetime → null
  - Empty id → null
  - Unparseable datetime → null
  - Empty string → null
  - Pinned `lastIndexOf` semantics for unusual inputs
- buildCursor:
  - Canonical `<ISO>_<id>` format
- Roundtrip:
  - Datetime + id preserved through buildCursor → parseCursor
  - UUID-with-hyphens id preserved (since split is at `_`, not `-`)

## Changelog deferral note
Per #523-#530.
