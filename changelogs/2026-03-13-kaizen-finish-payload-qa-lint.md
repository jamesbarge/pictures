# Kaizen — Finish _payload cleanup + QA lint fixes

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Removed last unused `_payload: ScraperTaskPayload` param from nickel.ts — completes 23/23 independent scraper cleanup
- Removed unused `lt` import and `QaIssueType` import from analyze-and-fix.ts
- Removed dead `uniqueLowConf` block (computed but never used) from analyze-and-fix.ts
- Removed unused `i` parameter from `.map()` callback in analyze-and-fix.ts
- Removed unused `IssueScope` import from scope-classifier.ts

## Impact
- Code quality improvement, no behavior changes
- Eliminates 6 `no-unused-vars` lint warnings in src/trigger/
- Kaizen category: lint-fix
