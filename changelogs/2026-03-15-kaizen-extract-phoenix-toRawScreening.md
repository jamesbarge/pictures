# Kaizen — extract toRawScreening in phoenix scraper

**PR**: #364
**Date**: 2026-03-15

## Changes
- Extracted the per-film showtime conversion block (date parsing, booking URL normalization, sourceId generation) from the `scrape()` method into a dedicated `toRawScreening()` private method
- Reduces nesting depth in the main scrape loop from 4 to 3 levels
- The conversion logic is now independently readable and locatable

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
