# Destructive Script Guards

**PR**: TBD
**Date**: 2026-06-09

## Changes
- Changed active database-mutating maintenance scripts to preview by default and require `--execute` before writing.
- Updated the upcoming-film audit orchestrator to forward `--execute` only to mutating child scripts.
- Added the documented `audit:fix-upcoming` package command and removed the obsolete `cleanup:feb-films` command.
- Deleted superseded hazardous one-offs:
  - `scripts/merge-duplicate-films.ts`
  - `scripts/fix-pcc-time-and-dupes.ts`
  - `scripts/manual-title-fixes.ts`
  - `src/scripts/cleanup-feb-films.ts`
  - `scripts/test-bfi-cleanup.ts`
- Updated the data-quality workflow documentation and added static regression tests for the guard contract.

## Impact
- Bare maintenance-script invocations can inspect proposed changes without mutating production data.
- Applying database changes now requires the consistent, visible `--execute` opt-in.
- Stale one-time scripts can no longer be accidentally rerun against current data.
