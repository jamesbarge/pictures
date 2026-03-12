# Kaizen — Remove unused imports in components

**PR**: #177
**Date**: 2026-03-12

## Changes
- `src/components/festivals/festival-programme.tsx`: Removed unused `festivals` (schema) and `and` (drizzle-orm) imports
- `src/components/festivals/festival-venues.tsx`: Removed unused `Card` import
- `src/components/film/screening-filters.tsx`: Removed unused `cn` import
- `src/components/filters/mobile-date-picker-modal.tsx`: Removed unused `format` from date-fns import

## Impact
- Eliminates 5 `@typescript-eslint/no-unused-vars` warnings
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
