# Kaizen — Extract shared admin agent guard and error helpers

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Created `src/app/api/admin/agents/shared.ts` with `geminiKeyMissingResponse()` and `agentErrorResponse()` helpers
- Updated health, links, and enrich route files to use shared helpers instead of inline duplicated code
- Each route lost ~15 lines of boilerplate, replaced by 1-line function calls

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: duplicate-pattern
