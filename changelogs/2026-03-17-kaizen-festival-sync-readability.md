# Kaizen — Extract toMergedScheduleEntry in Festival Sync

**PR**: #391
**Date**: 2026-03-17

## Changes
- Extracted `toMergedScheduleEntry()` helper function from two nearly identical inline conversion blocks in the festival sync POST handler
- The helper converts a server-side schedule DB row into the merged response shape with timestamp fallbacks
- Follows the existing `toMergedFollow()` pattern already in the file

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Reduces POST handler nesting depth and eliminates duplicated conversion logic
