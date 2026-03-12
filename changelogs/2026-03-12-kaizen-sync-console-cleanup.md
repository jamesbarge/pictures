# Kaizen — Clean up sync service console.log noise

**PR**: #164
**Date**: 2026-03-12

## Changes
- `src/lib/sync/user-sync-service.ts`: Promoted "not authenticated" to `console.warn`, removed 3 success `console.log` calls
- `src/lib/sync/festival-sync-service.ts`: Promoted "not authenticated" to `console.warn`, removed 3 success `console.log` calls

## Impact
- Code quality improvement, no behavior changes
- Reduces browser console noise from sync services (success messages were visible on every sync cycle)
- Failure paths retain `console.error`, auth issues now use `console.warn`
- Kaizen category: console-cleanup
