# Kaizen — Extract filter predicates from calendar view

**PR**: #353
**Date**: 2026-03-15

## Changes
- Extracted `matchesDateRange()` — handles date-from/date-to/both-set/neither-set logic in one function
- Extracted `matchesProgrammingType()` — handles repertory/new_release/special_event/preview switch logic
- Both are pure functions placed above the component, callable from the `useMemo` filter pipeline

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
