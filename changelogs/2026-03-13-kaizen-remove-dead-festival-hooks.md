# Kaizen — Remove Dead Festival Hooks and Unexport Internal Helper

**PR**: #276
**Date**: 2026-03-13

## Changes
- Deleted `useFestivalsWithNotification` and `useScheduleConflicts` from festival.ts — zero external consumers
- Removed `export` from `migrateStorageKey` in migrate-storage.ts — only used internally by `runAllStorageMigrations`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- ~64 lines removed from festival store
