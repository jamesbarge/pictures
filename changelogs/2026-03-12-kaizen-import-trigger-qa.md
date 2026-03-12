# Kaizen — Organize imports in trigger QA and scraper-wrapper

**PR**: #168
**Date**: 2026-03-12

## Changes
- `src/trigger/qa/utils/db-fixer.ts`: Moved `drizzle-orm` to external group, separated `@/` and relative imports
- `src/trigger/qa/analyze-and-fix.ts`: Grouped `@trigger.dev` + `drizzle-orm` as external, alphabetized relative imports
- `src/trigger/utils/scraper-wrapper.ts`: Separated `@/` import from relative imports with blank line

## Impact
- Code quality improvement, no behavior changes
- All three files now follow the 3-tier import convention (external → @/ → relative)
- Kaizen category: import-organization
