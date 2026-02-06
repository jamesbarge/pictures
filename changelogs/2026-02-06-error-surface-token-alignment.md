# Error Surface Token Alignment

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Updated `/error` route fallback to use semantic tokenized primary action and danger text styles.
- Updated `/global-error` root fallback to remove hardcoded hex values and use background/text/border/action tokens.
- Updated shared `ErrorBoundary` fallback icon + debug panel colors from raw red utilities to semantic danger tokens.
- Preserved all runtime behavior, logging, and retry flows; this is a visual consistency pass only.

## Impact
- Improves consistency and trust on failure states, especially during critical app errors.
- Ensures error UIs stay aligned with light/dark token themes rather than fixed colors.
- Reduces future maintenance risk by removing one-off color values from shared fallback components.
