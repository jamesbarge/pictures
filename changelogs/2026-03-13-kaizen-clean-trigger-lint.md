# Kaizen — Clean all remaining lint warnings in src/trigger/

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove last unused `_payload: ScraperTaskPayload` param from nickel.ts (completes 23-file cleanup)
- Remove unused `lt` import from drizzle-orm in analyze-and-fix.ts
- Remove unused `QaIssueType` type import in analyze-and-fix.ts
- Remove unused `IssueScope` type import in scope-classifier.ts
- Remove dead code: `lowConfidenceFilms` filter + `seenFilmIds` + `uniqueLowConf` (computed but never read)
- Remove unused `i` callback parameter in map on line 331

## Impact
- Code quality improvement, no behavior changes
- src/trigger/ directory now has ZERO ESLint warnings (was 6)
- Kaizen category: lint-fix
