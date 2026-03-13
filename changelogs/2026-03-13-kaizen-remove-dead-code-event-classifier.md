# Kaizen — Remove Dead Code in event-classifier

**PR**: #271
**Date**: 2026-03-13

## Changes
- Deleted `classifyEventsBatch()` (23 lines) — batch classification wrapper never called internally or externally
- Deleted `clearClassificationCache()` (6 lines) — cache clearing utility never called
- Both were dead code with zero callers

## Impact
- Code quality improvement, no behavior changes
- 30 lines of dead code removed
- Kaizen category: dead-code
