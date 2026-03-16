# Kaizen — Extract Deletion Helpers in BFI Cleanup

**PR**: #374
**Date**: 2026-03-16

## Changes
- Extracted `deleteGhostScreenings()` and `deleteOrphanFilms()` from `runBFICleanup()` in `src/scrapers/bfi-pdf/cleanup.ts`
- Main function reduced from 156 to ~110 lines
- Net change: +59/-41 (dry-run logic consolidated into early returns)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
