# Add unit tests for src/lib/constants.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/constants.test.ts` (new) — 10 vitest cases.

## Coverage
- `POSTER_BLUR_PLACEHOLDER` is a valid base64-encoded PNG (with PNG signature verification)
- `getSpecialFormat`: null/undefined/empty inputs, non-special inputs, all 4 normalised forms (35mm, 70mm, IMAX, 4K), case-insensitivity
- **Pinned priority**: 70mm > 35mm > IMAX > 4K when a string contains multiple tags. The if/else cascade order determines which badge appears on the frontend.

## Why
`getSpecialFormat` powers the format badge ("IMAX", "70mm" etc.) on every film card. A regression that swaps priority would silently surface the wrong badge on multi-format screenings ("70mm IMAX" → "IMAX" badge instead of "70mm").

## Changelog deferral note
Per #523-#530.
