# Kaizen — Extract scrapeDateCell from BFI fetchAllDates

**PR**: #376
**Date**: 2026-03-16

## Changes
- Extracted the inner date-cell scraping loop (48 lines) from `fetchAllDates()` into a dedicated `scrapeDateCell()` method
- New method handles: re-querying cells, clicking a date, parsing screenings, navigating back to calendar, and returning to the correct month
- Returns `null` when date cells are exhausted, preserving the original `break` behavior
- Parent function now reads as a clean two-level loop: months → dates → call `scrapeDateCell`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Reduces max nesting depth from 7 to 4 in `fetchAllDates`
