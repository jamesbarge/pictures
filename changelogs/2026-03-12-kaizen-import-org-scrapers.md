# Kaizen — Organize imports in cinema scrapers

**PR**: #175
**Date**: 2026-03-12

## Changes
- `src/scrapers/cinemas/phoenix.ts`: Grouped date-fns + playwright (external) above relative imports
- `src/scrapers/cinemas/david-lean.ts`: Grouped date-fns + playwright (external) above relative imports
- `src/scrapers/cinemas/olympic.ts`: Moved date-fns (external) above relative imports

## Impact
- Code quality improvement, no behavior changes
- Consistent 2-tier import grouping (external → relative) across these scrapers
- Kaizen category: import-organization
