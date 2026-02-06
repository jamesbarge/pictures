# Normalize Frontend Tokens and Time Format

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Replaced unresolved design token classes with valid existing tokens across cinemas, directors, seasons, map, watchlist, reachable, and fallback error pages.
- Normalized action hover styles from undefined aliases (`accent-hover`) to `accent-primary-hover` on primary links and buttons.
- Updated severity/status UI colors from undefined `error-*`, `warning-*`, and `success-*` aliases to `accent-danger`, `accent-highlight`, and `accent-success` token usage.
- Removed hardcoded hex colors from `src/app/global-error.tsx` and aligned it to shared theme tokens for background, text, borders, and interactive states.
- Standardized remaining user-facing time strings in reachable and festival key-date surfaces from 12-hour to 24-hour format (`HH:mm`) to match app-wide rules.

## Impact
- Fixes visual inconsistencies and potential broken styling caused by token names that are not present in the Tailwind/theme token set.
- Improves urgency/readability consistency for warning and error feedback across reachable and map flows.
- Brings fallback error experiences into the same design language as the rest of the product.
- Ensures public-facing time display remains consistent with the 24-hour format requirement.
