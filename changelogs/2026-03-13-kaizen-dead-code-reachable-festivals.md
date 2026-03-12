# Kaizen — Remove Unused Variables in Reachable and Festivals

**PR**: #XX
**Date**: 2026-03-13

## Changes
- `src/app/reachable/reachable-page-client.tsx`: Removed unused `hasValidInputs` from useReachable() destructuring
- `src/app/api/festivals/[slug]/route.ts`: Removed unused `screeningIds` variable (query already filters by festivalId)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
