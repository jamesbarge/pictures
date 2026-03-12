# Kaizen — Remove Unused Variables and Imports

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Removed unused variables and imports across 3 files
- `src/app/festivals/page.tsx`: Removed unused `today` variable
- `src/app/admin/festivals/page.tsx`: Removed unused `isUpcoming` and `today` variables
- `src/components/map/cinema-map.tsx`: Removed unused `useCallback`, `useMemo` imports and `originalHeight` variable

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
