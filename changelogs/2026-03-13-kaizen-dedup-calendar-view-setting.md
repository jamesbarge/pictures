# Kaizen — Deduplicate CalendarViewSetting radio options

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Extracted 3 near-identical radio option JSX blocks (films, screenings, table) into a VIEW_OPTIONS data array + .map() pattern
- Follows the same data-driven pattern used in TravelModeToggle component
- Reduced file from 113 lines to 86 lines (-27 lines of duplication)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: duplicate-pattern
