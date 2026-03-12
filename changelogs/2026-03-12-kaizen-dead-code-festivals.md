# Kaizen — Remove unused imports in festival components

**PR**: #169
**Date**: 2026-03-12

## Changes
- `festival-card.tsx`: Removed unused `Calendar`, `Clock`, `isPast`, `isFuture`, `isWithinInterval` imports and `now` variable
- `festival-key-dates.tsx`: Removed unused `Card` import, `now` and `allPast` variables
- `festival-list.tsx`: Removed unused `useState`, `Filter`, `Button` imports

## Impact
- Code quality improvement, no behavior changes
- Reduced lint warnings from 7819 to 7807 (-12)
- Kaizen category: dead-code (advanced from lint-fix and type-safety which were exhausted)
