# Kaizen — Fix lint warnings in eventive-scraper, posthog-api, scraper-health

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_slugBase` parameter from `createScreening()` in eventive-scraper.ts and both call sites
- Convert unused `projectId` assignments to `void getProjectId()` in posthog-api.ts (preserves env var validation side effect)
- Remove unused `config` variable assignment in scraper-health `runHealthCheckAllCinemas()`

## Impact
- Code quality improvement, no behavior changes
- 4 ESLint warnings resolved across 3 files
- Kaizen category: lint-fix
