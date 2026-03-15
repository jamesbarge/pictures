# Kaizen — Extract shared month lookup and AM/PM conversion in Close-Up scraper

**PR**: #356
**Date**: 2026-03-15

## Changes
- Extracted duplicated `months: Record<string, number>` lookup from `parseHtmlDateTime` and `extractPageDate` into module-level `MONTH_NAMES` constant
- Extracted duplicated AM/PM-to-24h conversion logic from `parseHtmlDateTime` and `combineDateAndTime` into `to24Hour()` helper function
- Both methods now call the shared implementations — no behavior change

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
