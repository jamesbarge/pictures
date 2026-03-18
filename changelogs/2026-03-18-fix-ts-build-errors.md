# Fix TypeScript build errors blocking CI

**PR**: #399
**Date**: 2026-03-18

## Changes
- Added intermediate `as unknown` cast in `src/scrapers/chains/curzon.ts:546` — `Window & typeof globalThis` cannot be cast directly to `Record<string, unknown>`
- Added intermediate `as unknown` cast in `src/scrapers/chains/curzon.ts:551` — same pattern
- Added intermediate `as unknown` cast in `scripts/cleanup-pcc-duplicate-screenings.ts:74` — `RowList<Row[]>` cannot be cast directly to `OrphanRow[]`

## Impact
- Unblocks CI on main — the `tsc --noEmit` step was failing with 3 type errors
- No runtime behavior changes; these are compile-time cast corrections only
