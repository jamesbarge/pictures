# Kaizen — Organize imports in API route files

**PR**: #154
**Date**: 2026-03-12

## Changes
- Reorganized imports in 3 API route files to follow external → internal grouping
- Added blank line separators between external packages and `@/` aliases
- Alphabetized external package imports within their group

## Files Modified
- `src/app/api/films/search/route.ts` — 8 imports reorganized into 2 groups
- `src/app/api/search/route.ts` — 5 imports reorganized into 2 groups
- `src/app/api/user/import-letterboxd/route.ts` — 6 imports reorganized into 2 groups

## Impact
- Code quality improvement, no behavior changes
- Consistent import ordering improves readability and reduces merge conflicts
- Kaizen category: import-organization
