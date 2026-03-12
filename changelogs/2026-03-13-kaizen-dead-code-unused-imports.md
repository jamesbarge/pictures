# Kaizen — Remove Unused Imports

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Removed 4 unused imports across 4 page/route files
- `src/app/sitemap.ts`: Removed unused `safeQuery` import from `@/db/safe-query`
- `src/app/cinemas/[slug]/page.tsx`: Removed unused `Film` icon from lucide-react
- `src/app/directors/page.tsx`: Removed unused `Film` icon from lucide-react
- `src/app/admin/analytics/page.tsx`: Removed unused `format` from date-fns

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
