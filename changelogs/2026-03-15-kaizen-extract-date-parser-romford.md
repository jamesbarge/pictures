# Kaizen — Extract date parser from Romford Lumiere scraper

**PR**: #355
**Date**: 2026-03-15

## Changes
- Extracted `parseDateText()` from `parseShowtimeDateTime()` in the Romford Lumiere scraper
- Original: 63-line cascading if-else chain (ISO → UK → text format) at 4 nesting levels
- New: standalone function with early returns, flat structure, independently testable
- Removed unused `now` variable from the parent method

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
